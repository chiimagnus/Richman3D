import type { FinancialStats, GameSnapshot, PlayerId, TradeTerms } from "./types";
import { completeGroup, netAssets, propertyTile } from "./economy";

export function canProposeTrade(snapshot: GameSnapshot, actor: PlayerId): boolean {
  return snapshot.decision.kind === "awaiting_roll" && snapshot.decision.actorId === actor && actor === snapshot.turnPlayerId && !snapshot.tradeUsed &&
    snapshot.players.some((player) => player.id === actor && !player.bankrupt);
}

export function tradePropertyReason(snapshot: GameSnapshot, owner: PlayerId, id: string): "not_owner" | "group_has_buildings" | null {
  const tile = snapshot.map.tiles.find((entry) => entry.type === "property" && entry.id === id);
  if (!tile || tile.type !== "property" || snapshot.properties[id]!.ownerId !== owner) return "not_owner";
  return snapshot.map.tiles.some((entry) => entry.type === "property" && entry.group === tile.group && snapshot.properties[entry.id]!.level > 0) ? "group_has_buildings" : null;
}

export function tradeOption(snapshot: GameSnapshot, proposerId: PlayerId, terms: TradeTerms) {
  const proposer = snapshot.players.find((player) => player.id === proposerId);
  const recipient = snapshot.players.find((player) => player.id === terms.recipientId);
  const failure = (reason: "players_invalid" | "invalid_terms" | "not_owner" | "group_has_buildings" | "insufficient_cash" | "amount_overflow") => ({ reason, candidate: null, sides: null } as const);
  if (!proposer || !recipient || proposer.id === recipient.id || proposer.bankrupt || recipient.bankrupt) return failure("players_invalid");
  const allIds = [...terms.givePropertyIds, ...terms.receivePropertyIds];
  if (terms.givePropertyIds.length > 3 || terms.receivePropertyIds.length > 3 || new Set(allIds).size !== allIds.length ||
      allIds.length === 0 && terms.cash === null || terms.cash !== null && (terms.cash.payerId !== proposerId && terms.cash.payerId !== recipient.id || !Number.isSafeInteger(terms.cash.amount) || terms.cash.amount <= 0)) return failure("invalid_terms");
  for (const [ids, owner] of [[terms.givePropertyIds, proposer.id], [terms.receivePropertyIds, recipient.id]] as const) {
    for (const id of ids) {
      const reason = tradePropertyReason(snapshot, owner, id);
      if (reason !== null) return failure(reason);
    }
  }
  const properties = { ...snapshot.properties };
  for (const id of terms.givePropertyIds) properties[id] = { ...properties[id]!, ownerId: recipient.id };
  for (const id of terms.receivePropertyIds) properties[id] = { ...properties[id]!, ownerId: proposer.id };
  try {
    const bookValue = (ids: readonly string[]) => ids.reduce((total, id) => total + BigInt(propertyTile(snapshot.map, id).price), 0n);
    const players = snapshot.players.map((player) => {
      if (player.id !== proposer.id && player.id !== recipient.id) return player;
      const given = player.id === proposer.id ? terms.givePropertyIds : terms.receivePropertyIds;
      const received = player.id === proposer.id ? terms.receivePropertyIds : terms.givePropertyIds;
      const paid = terms.cash?.payerId === player.id ? terms.cash.amount : 0;
      const income = terms.cash !== null && terms.cash.payerId !== player.id ? terms.cash.amount : 0;
      if (paid > player.cash) throw new Error("insufficient_cash");
      const cash = BigInt(player.cash) - BigInt(paid) + BigInt(income);
      if (cash > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("amount_overflow");
      const statistics = { ...player.statistics };
      const changes = { tradeCashReceived: BigInt(income), tradeCashPaid: BigInt(paid), tradeBookValueReceived: bookValue(received), tradeBookValueGiven: bookValue(given) };
      for (const [key, amount] of Object.entries(changes)) {
        const field = key as keyof FinancialStats;
        const total = BigInt(statistics[field]) + BigInt(amount);
        if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("amount_overflow");
        statistics[field] = Number(total);
      }
      return { ...player, cash: Number(cash), statistics };
    });
    const candidate = { ...snapshot, properties, players };
    for (const id of [proposer.id, recipient.id]) netAssets(candidate, id);
    const groups = (state: GameSnapshot, owner: PlayerId) => [...new Set(state.map.tiles.flatMap((tile) => tile.type === "property" && state.properties[tile.id]!.ownerId === owner && completeGroup(state, tile) ? [tile.group] : []))];
    const sides = [proposer.id, recipient.id].map((id) => ({ id, cashBefore: snapshot.players.find((player) => player.id === id)!.cash,
      cashAfter: players.find((player) => player.id === id)!.cash, given: id === proposer.id ? terms.givePropertyIds : terms.receivePropertyIds,
      received: id === proposer.id ? terms.receivePropertyIds : terms.givePropertyIds, groupsBefore: groups(snapshot, id), groupsAfter: groups(candidate, id) }));
    return { reason: null, candidate, sides } as const;
  } catch (error) {
    return failure(error instanceof Error && error.message === "insufficient_cash" ? "insufficient_cash" : "amount_overflow");
  }
}
