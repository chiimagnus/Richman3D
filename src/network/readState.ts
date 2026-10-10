import { normalizeName, SEAT_COLORS } from "../domain/config";
import { mapFor } from "../domain/maps";
import { cardInstances, cardType, HAND_LIMIT } from "../domain/cards";
import { FINANCIAL_STAT_FIELDS, integer, record, restoreDebt, restoreEvent, restoreHistory, restoreTradeProposal, sameData } from "../domain/restore";
import { rulesFor } from "../domain/rules";
import { matchResult } from "../domain/selectors";
import type { CardInstanceId, GameReadSnapshot } from "../domain/types";
import { roomOptions } from "./protocol";

export function validateRoomState(value: Record<string, unknown>, code: string): void {
  record(value, ["version", "kind", "room", "reset", "events"]);
  const room = record(value.room, ["code", "options", "members", "playerId", "expiresAt", "snapshot"]);
  const options = roomOptions(room.options);
  if (room.code !== code || typeof value.reset !== "boolean" || !Array.isArray(value.events)) throw new Error();
  integer(room.expiresAt, 1, 8_640_000_000_000_000);
  if (!Array.isArray(room.members) || room.members.length < 1 || room.members.length > options.seats) throw new Error();
  const members = room.members.map((raw, index) => {
    const member = record(raw, ["id", "name", "connected"]);
    if (member.id !== `p${index + 1}` || typeof member.connected !== "boolean" || member.name !== null && (typeof member.name !== "string" || normalizeName(member.name) !== member.name)) throw new Error();
    return member;
  });
  if (!members.some((member) => member.id === room.playerId)) throw new Error();
  if (room.snapshot === null) { if (value.events.length) throw new Error(); return; }
  const raw = record(room.snapshot, ["revision", "config", "rules", "map", "completedRounds", "turnOrder", "players", "turnPlayerId", "tradeUsed", "itemUsed", "activeItem", "decision", "properties", "lastRoll", "history"]);
  const config = record(raw.config, ["players", "rulesVersion", "mapId", "mapVersion"]);
  if (config.mapId !== options.mapId || config.rulesVersion !== options.rulesVersion || typeof config.mapId !== "string" || typeof config.rulesVersion !== "string" || !Array.isArray(config.players) || config.players.length !== options.seats || members.length !== options.seats) throw new Error();
  const map = mapFor(config.mapId, integer(config.mapVersion, 1));
  const rules = rulesFor(config.rulesVersion);
  if (!sameData(raw.map, map) || !sameData(raw.rules, rules)) throw new Error();
  config.players.forEach((entry, index) => {
    const player = record(entry, ["id", "controller", "difficulty", "name", "defaultNameKey", "color"]);
    if (player.id !== members[index]!.id || player.defaultNameKey !== player.id || player.controller !== "human" || player.difficulty !== "normal" || player.name !== members[index]!.name || player.color !== SEAT_COLORS[index]) throw new Error();
  });
  integer(raw.revision); integer(raw.completedRounds, 0, rules.roundLimit);
  if (typeof raw.tradeUsed !== "boolean" || typeof raw.itemUsed !== "boolean" || !Array.isArray(raw.turnOrder) || raw.turnOrder.length !== members.length || new Set(raw.turnOrder).size !== members.length || raw.turnOrder.some((id) => !members.some((member) => member.id === id)) || !members.some((member) => member.id === raw.turnPlayerId)) throw new Error();
  if (!Array.isArray(raw.players) || raw.players.length !== members.length) throw new Error();
  raw.players.forEach((entry, index) => {
    const player = record(entry, ["id", "cash", "position", "bankrupt", "hand", "statistics"]);
    if (player.id !== members[index]!.id || typeof player.bankrupt !== "boolean") throw new Error();
    integer(player.cash); integer(player.position, 0, map.tiles.length - 1);
    if (player.id === room.playerId ? !Array.isArray(player.hand) || player.hand.length > HAND_LIMIT + 1 || new Set(player.hand).size !== player.hand.length || player.hand.some((id) => !cardInstances(rules).includes(id) || !rules.chanceCards.some((card) => card.kind === "item" && card.id === cardType(id))) : player.hand !== null) throw new Error();
    const statistics = record(player.statistics, FINANCIAL_STAT_FIELDS);
    Object.values(statistics).forEach((amount) => integer(amount));
  });
  const properties = record(raw.properties, map.tiles.filter((tile) => tile.type === "property").map((tile) => tile.id));
  Object.values(properties).forEach((entry) => {
    const property = record(entry, ["ownerId", "level", "constructionCosts"]);
    if (property.ownerId !== null && !members.some((member) => member.id === property.ownerId) || !Array.isArray(property.constructionCosts) || property.constructionCosts.length !== integer(property.level, 0, 3)) throw new Error();
    property.constructionCosts.forEach((cost) => integer(cost));
  });
  if (raw.lastRoll !== null) { if (!Array.isArray(raw.lastRoll) || raw.lastRoll.length !== 2) throw new Error(); raw.lastRoll.forEach((face) => integer(face, 1, 6)); }
  if (raw.activeItem !== null) {
    const item = record(raw.activeItem, ["actorId", "instanceId", "total"]);
    if (!members.some((member) => member.id === item.actorId) || !cardInstances(rules).includes(item.instanceId as CardInstanceId)) throw new Error();
    if (item.total !== null) integer(item.total, 2, 12);
  }
  const decision = record(raw.decision);
  const snapshot = raw as GameReadSnapshot;
  if (decision.kind === "game_over") {
    record(decision, ["kind", "result"]);
    const result = record(decision.result, ["reason", "rankings", "winnerIds"]);
    if (result.reason !== "last_survivor" && result.reason !== "round_limit" || !sameData(result, matchResult(snapshot, result.reason))) throw new Error();
  } else {
    if (!members.some((member) => member.id === decision.actorId)) throw new Error();
    switch (decision.kind) {
      case "awaiting_roll": record(decision, ["kind", "actorId"]); break;
      case "awaiting_purchase": record(decision, ["kind", "actorId", "propertyId"]); if (!Object.hasOwn(properties, String(decision.propertyId))) throw new Error(); break;
      case "awaiting_discard": record(decision, ["kind", "actorId", "continuation"]); if (decision.continuation !== "finish_turn") throw new Error(); break;
      case "awaiting_trade": record(decision, ["kind", "actorId", "proposal"]); restoreTradeProposal(decision.proposal, snapshot); break;
      case "awaiting_debt": record(decision, ["kind", "actorId", "debt"]); restoreDebt(decision.debt, snapshot, decision.actorId as GameReadSnapshot["turnPlayerId"]); break;
      default: throw new Error();
    }
  }
  restoreHistory(raw.history, snapshot);
  value.events.forEach((event) => restoreEvent(event, snapshot));
}
