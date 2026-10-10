import { legalCommands, publicProperty } from "./selectors";
import type { BotDifficulty, CardInstanceId, Command, Decision, GameReadSnapshot, GameSnapshot, PlayerId, TradeTerms } from "./types";
import { playerConfig } from "./config";
import { completeGroup, discountedCost, saleOption, netAssets, rentFor, upgradeOption } from "./economy";
import { canProposeTrade, tradeOption } from "./market";
import { cardType } from "./cards";
import { movement } from "./movement";
import type { RuleSet } from "./rules";
import type { BoardTile } from "./board";

export type BotReason = "roll" | "use_item" | "keep_valuable" | "reserve_cash" | "buy_property" | "complete_group" | "upgrade_income" | "debt_rescue" | "insolvent" | "fair_trade" | "unfair_trade";
export type BotAction = { readonly command: Command; readonly reason: BotReason };
type LiquidityCommand = Extract<Command, { propertyId: string }> & { kind: "sell_building" };
type UpgradeCommand = Extract<Command, { propertyId: string }> & { kind: "upgrade" };
type TradeEvaluation = { readonly gain: number; readonly cashAfter: number; readonly groupGain: number; readonly opponentGroupGain: number };
export type BotObservation = {
  readonly actorId: PlayerId;
  readonly difficulty: BotDifficulty;
  readonly cash: number;
  readonly hand: readonly CardInstanceId[];
  readonly players: readonly { readonly id: PlayerId; readonly cash: number; readonly position: number; readonly bankrupt: boolean }[];
  readonly properties: readonly ReturnType<typeof publicProperty>[];
  readonly tiles: readonly BoardTile[];
  readonly rules: RuleSet;
  readonly completedRounds: number;
  readonly turnPlayerId: PlayerId;
  readonly activeItem: GameSnapshot["activeItem"];
  readonly decision: Exclude<Decision, { kind: "game_over" }>;
  readonly actions: readonly Command[];
  readonly liquidity: readonly { readonly command: LiquidityCommand; readonly cost: number; readonly proceeds: number; readonly valueLoss: number;
    readonly rentChanges: readonly { readonly propertyId: string; readonly currentRent: number; readonly nextRent: number }[] }[];
  readonly upgrades: readonly { readonly command: UpgradeCommand; readonly cost: number; readonly currentRent: number; readonly nextRent: number }[];
  readonly trade: TradeEvaluation | null;
  readonly tradeCandidates: readonly { readonly command: Extract<Command, { kind: "trade_propose" }>; readonly evaluation: TradeEvaluation }[];
};

function evaluateTrade(snapshot: GameSnapshot, proposerId: PlayerId, terms: TradeTerms, actor: PlayerId): TradeEvaluation | null {
  const option = tradeOption(snapshot, proposerId, terms);
  if (!option.candidate) return null;
  const groupValue = (state: GameReadSnapshot, owner: PlayerId) => state.map.tiles.reduce((value, tile) => value + (tile.type === "property" && state.properties[tile.id]!.ownerId === owner && completeGroup(state, tile) ? tile.price : 0), 0);
  const other = actor === proposerId ? terms.recipientId : proposerId;
  return { gain: netAssets(option.candidate, actor) - netAssets(snapshot, actor), cashAfter: option.candidate.players.find((player) => player.id === actor)!.cash,
    groupGain: groupValue(option.candidate, actor) - groupValue(snapshot, actor), opponentGroupGain: groupValue(option.candidate, other) - groupValue(snapshot, other) };
}

export function observeBot(snapshot: GameSnapshot): BotObservation | null {
  if (snapshot.decision.kind === "game_over") return null;
  const actor = snapshot.decision.actorId;
  if (playerConfig(snapshot.config, actor).controller !== "bot") return null;
  const player = snapshot.players.find((candidate) => candidate.id === actor)!;
  const tradeCandidates: BotObservation["tradeCandidates"][number][] = [];
  if (canProposeTrade(snapshot, actor)) {
    for (const tile of snapshot.map.tiles) {
      if (tile.type !== "property") continue;
      const owner = snapshot.properties[tile.id]!.ownerId;
      const group = snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group);
      if (owner === null || owner === actor || !group.every((candidate) => candidate.id === tile.id || snapshot.properties[candidate.id]!.ownerId === actor)) continue;
      const amount = tile.price + Math.ceil(group.reduce((value, candidate) => value + (candidate.type === "property" ? candidate.price : 0), 0) * 0.15);
      const command: Extract<Command, { kind: "trade_propose" }> = { kind: "trade_propose", actor, expectedRevision: snapshot.revision,
        terms: { recipientId: owner, givePropertyIds: [], receivePropertyIds: [tile.id], cash: { payerId: actor, amount } } };
      const evaluation = evaluateTrade(snapshot, actor, command.terms, actor);
      if (evaluation) tradeCandidates.push({ command, evaluation });
    }
  }
  const actions = [...legalCommands(snapshot, actor), ...tradeCandidates.map((candidate) => candidate.command)];
  const liquidity = actions.filter((command): command is LiquidityCommand => command.kind === "sell_building")
    .map((command) => {
      const option = saleOption(snapshot, actor, command.propertyId);
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === command.propertyId)!;
      const candidate = { ...snapshot, properties: { ...snapshot.properties, [tile.id]: option.nextProperty } };
      const rentChanges = snapshot.map.tiles.filter((other) => other.type === "property" && (other.id === tile.id || tile.type === "property" && other.group === tile.group))
        .map((other) => ({ propertyId: other.id, currentRent: rentFor(snapshot, other.id), nextRent: rentFor(candidate, other.id) }))
        .filter((change) => change.currentRent !== change.nextRent);
      return { command, cost: option.cost, proceeds: option.proceeds, valueLoss: option.loss, rentChanges };
    });
  const upgrades = actions.filter((command): command is UpgradeCommand => command.kind === "upgrade").map((command) => {
    const option = upgradeOption(snapshot, actor, command.propertyId);
    return { command, cost: option.cost, currentRent: option.currentRent, nextRent: option.nextRent! };
  });
  return {
    actorId: actor, difficulty: playerConfig(snapshot.config, actor).difficulty, cash: player.cash, hand: [...player.hand],
    players: snapshot.players.map((player) => ({ id: player.id, cash: player.cash, position: player.position, bankrupt: player.bankrupt })),
    properties: snapshot.map.tiles.filter((tile) => tile.type === "property").map((tile) => publicProperty(snapshot, tile.id)),
    tiles: snapshot.map.tiles, rules: snapshot.rules, completedRounds: snapshot.completedRounds, turnPlayerId: snapshot.turnPlayerId,
    activeItem: snapshot.activeItem ? { ...snapshot.activeItem } : null, decision: snapshot.decision, actions, liquidity, upgrades,
    trade: snapshot.decision.kind === "awaiting_trade" ? evaluateTrade(snapshot, snapshot.decision.proposal.proposerId, snapshot.decision.proposal, actor) : null, tradeCandidates,
  };
}

function commandKey(command: Command): string {
  return `${command.kind}:${"propertyId" in command ? command.propertyId : "instanceId" in command ? command.instanceId : "terms" in command ? command.terms.recipientId + command.terms.receivePropertyIds.join(",") : ""}:${command.kind === "use_item" ? String(command.total ?? 0).padStart(2, "0") + (command.targetId ?? "") : ""}`;
}

function best(actions: readonly (BotAction & { score: number })[]): (BotAction & { score: number }) | undefined {
  return [...actions].sort((first, second) => second.score - first.score || (commandKey(first.command) < commandKey(second.command) ? -1 : commandKey(first.command) > commandKey(second.command) ? 1 : 0))[0];
}

function completionValue(observation: BotObservation, propertyId: string, actor: PlayerId): number {
  const property = observation.properties.find((property) => property.tile.id === propertyId)!;
  const group = observation.properties.filter((candidate) => candidate.tile.group === property.tile.group);
  return group.every((candidate) => candidate.tile.id === propertyId || candidate.ownerId === actor)
    ? group.reduce((value, candidate) => value + candidate.tile.price, 0) : 0;
}

function landingScore(observation: BotObservation, actor: PlayerId, from: number, total: number, item: string | null, opportunities: boolean): number {
  const move = movement(from, observation.tiles.length, "forward", total, observation.rules, true);
  const landing = (position: number, drawChance: boolean): number => {
    const tile = observation.tiles[position]!;
    if (tile.type === "tax") return -(item === "tax-discount" ? discountedCost(tile.amount, observation.rules.taxDiscountPercent) : tile.amount);
    if (tile.type === "property") {
      const property = observation.properties.find((property) => property.tile.id === tile.id)!;
      if (property.ownerId !== null && property.ownerId !== actor) return item === "rent-waiver" ? 0 : -property.rent;
      return property.ownerId === null && opportunities ? tile.price * 0.03 + completionValue(observation, tile.id, actor) * 0.15 : 0;
    }
    if (tile.type !== "chance" || !drawChance) return 0;
    return observation.rules.chanceCards.reduce((value, card) => {
      if (card.kind === "cash") return value + card.amount;
      if (card.kind !== "move") return value;
      const next = movement(position, observation.tiles.length, card.direction, card.steps, observation.rules, false);
      return value + next.startBonus + landing(next.to, false);
    }, 0) / observation.rules.chanceCards.length;
  };
  return move.startBonus + landing(move.to, move.drawChance);
}

function rollScores(observation: BotObservation, actor: PlayerId, position: number, item: string | null, opportunities = false): number[] {
  if (observation.activeItem?.actorId === actor && cardType(observation.activeItem.instanceId) === "controlled-dice") return [landingScore(observation, actor, position, observation.activeItem.total!, item, opportunities)];
  const scores: number[] = [];
  for (let left = 1; left <= 6; left += 1) for (let right = 1; right <= 6; right += 1) scores.push(landingScore(observation, actor, position, left + right, item, opportunities));
  return scores;
}

function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }

export function botReserve(observation: BotObservation, difficulty: BotDifficulty): number {
  if (difficulty === "easy") return 400;
  const player = observation.players.find((player) => player.id === observation.actorId)!;
  const item = observation.activeItem?.actorId === player.id ? cardType(observation.activeItem.instanceId) : null;
  const losses = rollScores(observation, player.id, player.position, item).map((value) => Math.max(0, -value)).sort((first, second) => first - second);
  return difficulty === "normal" ? 260 + Math.ceil(average(losses)) : 180 + Math.ceil(losses[Math.ceil(losses.length * 0.9) - 1]!);
}

function rescueCommand(observation: BotObservation, difficulty: BotDifficulty): Command {
  if (observation.decision.kind !== "awaiting_debt") throw new Error("没有待清算债务");
  const options = [...observation.liquidity].sort((first, second) => commandKey(first.command) < commandKey(second.command) ? -1 : 1);
  const shortfall = observation.decision.debt.amount - observation.cash;
  const horizon = difficulty === "easy" ? 1 : difficulty === "normal" ? 3 : 6;
  const loss = (selected: typeof options) => {
    const rents = new Map<string, { currentRent: number; nextRent: number }>();
    for (const option of selected) for (const change of option.rentChanges) {
      const previous = rents.get(change.propertyId);
      rents.set(change.propertyId, { currentRent: change.currentRent, nextRent: Math.min(previous?.nextRent ?? change.currentRent, change.nextRent) });
    }
    return selected.reduce((value, option) => value + option.valueLoss, 0) + [...rents.values()].reduce((value, change) => value + change.currentRent - change.nextRent, 0) * horizon;
  };
  let chosen: { command: Command; loss: number; proceeds: number } | null = null;
  for (let subset = 1; subset < 2 ** options.length; subset += 1) {
    let proceeds = 0;
    const selected: typeof options = [];
    let command: Command | null = null;
    for (let index = 0; index < options.length; index += 1) if (subset & 2 ** index) {
      const option = options[index]!;
      command ??= option.command;
      proceeds += option.proceeds;
      selected.push(option);
    }
    if (proceeds < shortfall || !command) continue;
    const totalLoss = loss(selected);
    if (!chosen || totalLoss < chosen.loss || totalLoss === chosen.loss && (proceeds < chosen.proceeds || proceeds === chosen.proceeds && commandKey(command) < commandKey(chosen.command))) chosen = { command, loss: totalLoss, proceeds };
  }
  if (chosen) return chosen.command;
  const next = options.sort((first, second) => loss([first]) / first.proceeds - loss([second]) / second.proceeds || (commandKey(first.command) < commandKey(second.command) ? -1 : 1))[0];
  if (!next) throw new Error("债务没有合法清算命令");
  return next.command;
}

export function chooseBotAction(observation: BotObservation | null, difficulty: BotDifficulty = observation?.difficulty ?? "normal"): BotAction | null {
  if (!observation) return null;
  const { actions, decision } = observation;
  if (actions.length === 0) throw new Error("电脑决策没有合法出口");
  const action = (kind: Command["kind"], reason: BotReason): BotAction => {
    const command = actions.find((command) => command.kind === kind);
    if (!command) throw new Error("策略选择没有对应合法命令");
    return { command, reason };
  };
  const reserve = botReserve(observation, difficulty);
  const player = observation.players.find((player) => player.id === observation.actorId)!;
  if (decision.kind === "awaiting_discard") {
    const value = (instanceId: CardInstanceId) => {
      switch (cardType(instanceId)) {
        case "controlled-dice": return 40;
        case "rent-waiver": return Math.max(5, ...observation.properties.filter((property) => property.ownerId !== null && property.ownerId !== player.id).map((property) => property.rent / 2));
        case "tax-discount": return Math.max(...observation.tiles.map((tile) => tile.type === "tax" ? (tile.amount - discountedCost(tile.amount, observation.rules.taxDiscountPercent)) / 2 : 0));
        case "construction-discount": return observation.properties.some((property) => property.ownerId === player.id) ? 20 : 5;
        default: return 10;
      }
    };
    const discard = best(actions.map((command) => ({ command, reason: "keep_valuable" as const, score: command.kind === "discard_item" ? -value(command.instanceId) : -Infinity })))!;
    return { command: discard.command, reason: discard.reason };
  }
  if (decision.kind === "awaiting_trade") {
    const trade = observation.trade;
    const value = trade ? trade.gain + trade.groupGain * (difficulty === "easy" ? 0 : difficulty === "normal" ? 0.25 : 0.35) - Math.max(0, trade.opponentGroupGain) * (difficulty === "hard" ? 0.1 : 0) : -Infinity;
    return trade && value >= 0 && trade.cashAfter >= Math.min(observation.cash, reserve) && actions.some((command) => command.kind === "trade_accept") ? action("trade_accept", "fair_trade") : action("trade_reject", "unfair_trade");
  }
  if (decision.kind === "awaiting_debt") {
    if (actions.some((command) => command.kind === "bankrupt")) return action("bankrupt", "insolvent");
    return { command: rescueCommand(observation, difficulty), reason: "debt_rescue" };
  }
  if (decision.kind === "awaiting_purchase") {
    const property = observation.properties.find((property) => property.tile.id === decision.propertyId)!;
    return actions.some((command) => command.kind === "buy") && observation.cash - property.tile.price >= reserve
      ? action("buy", completionValue(observation, decision.propertyId, player.id) > 0 ? "complete_group" : "buy_property") : action("skip", "reserve_cash");
  }
  const remaining = Math.min(difficulty === "easy" ? 2 : difficulty === "normal" ? 4 : 6, observation.rules.roundLimit - observation.completedRounds - 1);
  const opponents = observation.players.filter((other) => !other.bankrupt && other.id !== player.id);
  const income = (propertyId: string, rent: number) => difficulty === "hard" ? opponents.reduce((value, other) => {
    let landings = 0;
    for (let left = 1; left <= 6; left += 1) for (let right = 1; right <= 6; right += 1) if (observation.tiles[(other.position + left + right) % observation.tiles.length]!.id === propertyId) landings += 1;
    return value + rent * landings / 36;
  }, 0) : rent * opponents.length / observation.tiles.length;
  const scores = rollScores(observation, player.id, player.position, null, true);
  const baseline = average(scores);
  const items = actions.filter((command): command is Extract<Command, { kind: "use_item" }> => command.kind === "use_item").map((command) => {
    let score = 0;
    const type = cardType(command.instanceId);
    if (type === "controlled-dice") score = landingScore(observation, player.id, player.position, command.total!, null, true) - baseline;
    else if (type === "swap-positions") {
      const target = observation.players.find((target) => target.id === command.targetId)!;
      score = average(rollScores(observation, player.id, target.position, null, true)) - baseline;
      if (difficulty !== "easy") score -= (average(rollScores(observation, target.id, player.position, null, true)) - average(rollScores(observation, target.id, target.position, null, true))) * (difficulty === "normal" ? 0.25 : 0.5);
    } else if (type === "construction-discount") score = Math.max(0, ...observation.upgrades.filter((option) => remaining > 0 && income(option.command.propertyId, option.nextRent - option.currentRent) > 0 &&
      (difficulty !== "easy" || observation.properties.find((property) => property.tile.id === option.command.propertyId)!.level === 0) && observation.cash - discountedCost(option.cost, observation.rules.constructionDiscountPercent) >= reserve)
      .map((option) => option.cost - discountedCost(option.cost, observation.rules.constructionDiscountPercent)));
    else score = average(rollScores(observation, player.id, player.position, type, true)) - baseline;
    return { command, reason: "use_item" as const, score };
  });
  const item = best(items);
  if (item && item.score >= (difficulty === "easy" ? 25 : difficulty === "normal" ? 8 : 5)) return { command: item.command, reason: item.reason };
  const trade = best(observation.tradeCandidates.filter((candidate) => candidate.evaluation.cashAfter >= reserve)
    .map((candidate) => ({ command: candidate.command, reason: "complete_group" as const, score: candidate.evaluation.gain + candidate.evaluation.groupGain * (difficulty === "easy" ? 0.15 : difficulty === "normal" ? 0.25 : 0.35) })));
  if (trade && trade.score > 0 && observation.completedRounds < observation.rules.roundLimit - 1) return { command: trade.command, reason: trade.reason };
  const upgrades = observation.upgrades.filter((option) => observation.cash - option.cost >= reserve && (difficulty !== "easy" || observation.properties.find((property) => property.tile.id === option.command.propertyId)!.level === 0))
    .map((option) => ({ command: option.command, reason: "upgrade_income" as const, score: income(option.command.propertyId, option.nextRent - option.currentRent) * remaining / Math.max(1, option.cost) }));
  const investment = best(upgrades);
  if (investment && investment.score > 0) return { command: investment.command, reason: investment.reason };
  return action("roll", "roll");
}
