import { legalCommands, publicProperty } from "./selectors";
import type { CardInstanceId, Command, Decision, GameSnapshot, PlayerId } from "./types";
import { playerConfig } from "./config";
import { liquidityOption, rentFor, upgradeOption } from "./economy";
import { tradeResponseReason } from "./market";
import type { RuleSet } from "./rules";
import type { BoardTile } from "./board";

export type BotReason = "roll" | "use_item" | "discard_new" | "reserve_cash" | "buy_property" | "auction_value" | "debt_rescue" | "insolvent" | "fair_trade" | "unfair_trade";
export type BotAction = { readonly command: Command; readonly reason: BotReason };
type LiquidityCommand = Extract<Command, { propertyId: string }> & { kind: "sell_building" | "mortgage" | "redeem" };
type UpgradeCommand = Extract<Command, { propertyId: string }> & { kind: "upgrade" };
export type BotObservation = {
  readonly actorId: PlayerId;
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
  readonly liquidity: readonly { readonly command: LiquidityCommand; readonly cost: number; readonly proceeds: number; readonly rentLoss: number }[];
  readonly upgrades: readonly { readonly command: UpgradeCommand; readonly cost: number; readonly currentRent: number; readonly nextRent: number }[];
  readonly tradeReason: ReturnType<typeof tradeResponseReason>;
};

export function observeBot(snapshot: GameSnapshot): BotObservation | null {
  if (snapshot.decision.kind === "game_over") return null;
  const actor = snapshot.decision.actorId;
  if (playerConfig(snapshot.config, actor).controller !== "bot") return null;
  const player = snapshot.players.find((candidate) => candidate.id === actor)!;
  const actions = legalCommands(snapshot, actor);
  const liquidity = actions.filter((command): command is LiquidityCommand => command.kind === "sell_building" || command.kind === "mortgage" || command.kind === "redeem")
    .map((command) => {
      const option = liquidityOption(snapshot, actor, command.propertyId, command.kind);
      const tile = snapshot.map.tiles.find((candidate) => candidate.id === command.propertyId)!;
      const groupLoss = command.kind === "mortgage" && tile.type === "property" ? snapshot.map.tiles.filter((candidate) => candidate.type === "property" && candidate.group === tile.group && candidate.id !== tile.id)
        .reduce((loss, candidate) => loss + Math.max(0, rentFor(snapshot, candidate.id) - rentFor({ ...snapshot, properties: { ...snapshot.properties, [tile.id]: option.nextProperty } }, candidate.id)), 0) : 0;
      return { command, cost: option.cost, proceeds: option.proceeds, rentLoss: option.currentRent - option.nextRent + groupLoss };
    });
  const upgrades = actions.filter((command): command is UpgradeCommand => command.kind === "upgrade").map((command) => {
    const option = upgradeOption(snapshot, actor, command.propertyId);
    return { command, cost: option.cost, currentRent: option.currentRent, nextRent: option.nextRent! };
  });
  return {
    actorId: actor, cash: player.cash, hand: [...player.hand],
    players: snapshot.players.map((player) => ({ id: player.id, cash: player.cash, position: player.position, bankrupt: player.bankrupt })),
    properties: snapshot.map.tiles.filter((tile) => tile.type === "property").map((tile) => publicProperty(snapshot, tile.id)),
    tiles: snapshot.map.tiles, rules: snapshot.rules, completedRounds: snapshot.completedRounds, turnPlayerId: snapshot.turnPlayerId,
    activeItem: snapshot.activeItem ? { ...snapshot.activeItem } : null, decision: snapshot.decision, actions, liquidity, upgrades, tradeReason: tradeResponseReason(snapshot),
  };
}

export function chooseBotAction(observation: BotObservation | null, _difficulty: "normal" = "normal"): BotAction | null {
  if (!observation) return null;
  const { actions, decision } = observation;
  if (actions.length === 0) throw new Error("电脑决策没有合法出口");
  const action = (kind: Command["kind"], reason: BotReason): BotAction => {
    const command = actions.find((command) => command.kind === kind);
    if (!command) throw new Error("策略选择没有对应合法命令");
    return { command, reason };
  };
  if (decision.kind === "awaiting_discard") return { command: actions.at(-1)!, reason: "discard_new" };
  if (decision.kind === "awaiting_roll" && actions.some((command) => command.kind === "use_item")) return action("use_item", "use_item");
  if (decision.kind === "awaiting_trade") return observation.tradeReason === "fair_value" ? action("trade_accept", "fair_trade") : action("trade_reject", "unfair_trade");
  if (decision.kind === "awaiting_auction") {
    const bid = actions.find((command) => command.kind === "auction_bid");
    const property = observation.properties.find((property) => property.tile.id === decision.propertyId)!;
    return bid?.kind === "auction_bid" && bid.amount <= property.tile.price && observation.cash - bid.amount >= 260
      ? { command: bid, reason: "auction_value" } : action("auction_pass", "reserve_cash");
  }
  if (decision.kind === "awaiting_debt") {
    if (actions.some((command) => command.kind === "bankrupt")) return action("bankrupt", "insolvent");
    const option = [...observation.liquidity].sort((first, second) => first.rentLoss - second.rentLoss || (first.command.propertyId < second.command.propertyId ? -1 : first.command.propertyId > second.command.propertyId ? 1 : 0))[0];
    if (!option) throw new Error("债务没有合法清算命令");
    return { command: option.command, reason: "debt_rescue" };
  }
  if (decision.kind === "awaiting_purchase") {
    const property = observation.properties.find((property) => property.tile.id === decision.propertyId)!;
    return actions.some((command) => command.kind === "buy") && observation.cash - property.tile.price >= 260
      ? action("buy", "buy_property") : action("skip", "reserve_cash");
  }
  return action("roll", "roll");
}
