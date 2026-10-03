import type { AuctionDecision, GameSnapshot, PlayerId } from "./types";
import { netAssets, propertyTile } from "./economy";

export const AUCTION_STEP = 10;

export function minimumBid(snapshot: GameSnapshot, auction: AuctionDecision): number | null {
  const step = BigInt(AUCTION_STEP);
  const next = BigInt(auction.highestBid) + step;
  const headroom = BigInt(Number.MAX_SAFE_INTEGER) - BigInt(netAssets(snapshot, auction.actorId));
  const minimumCost = BigInt(propertyTile(snapshot.map, auction.propertyId).price) - headroom;
  const safeBid = minimumCost > 0n ? (minimumCost + step - 1n) / step * step : 0n;
  const amount = next > safeBid ? next : safeBid;
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

export function canBid(snapshot: GameSnapshot, auction: AuctionDecision, actor: PlayerId, amount: number): boolean {
  const minimum = minimumBid(snapshot, auction);
  const player = snapshot.players.find((candidate) => candidate.id === actor);
  return actor === auction.actorId && !!player && !player.bankrupt && !auction.withdrawnIds.includes(actor) && auction.highestBidderId !== actor &&
    minimum !== null && Number.isSafeInteger(amount) && amount >= minimum && amount % AUCTION_STEP === 0 && amount <= player.cash;
}

export function nextBidder(snapshot: GameSnapshot, auction: AuctionDecision, after: PlayerId): PlayerId | null {
  const start = snapshot.turnOrder.indexOf(after);
  for (let offset = 1; offset <= snapshot.turnOrder.length; offset += 1) {
    const actor = snapshot.turnOrder[(start + offset) % snapshot.turnOrder.length]!;
    if (actor !== auction.highestBidderId && !auction.withdrawnIds.includes(actor) && !snapshot.players.find((player) => player.id === actor)!.bankrupt) return actor;
  }
  return null;
}

export function startAuction(snapshot: GameSnapshot, propertyId: string): AuctionDecision | null {
  const auction: AuctionDecision = { kind: "awaiting_auction", actorId: snapshot.turnPlayerId, propertyId, landingPlayerId: snapshot.turnPlayerId,
    highestBid: 0, highestBidderId: null, withdrawnIds: snapshot.players.filter((player) => !player.bankrupt && player.cash < AUCTION_STEP).map((player) => player.id), continuation: "finish_turn" };
  const actorId = nextBidder(snapshot, auction, snapshot.turnPlayerId);
  return actorId === null ? null : { ...auction, actorId };
}
