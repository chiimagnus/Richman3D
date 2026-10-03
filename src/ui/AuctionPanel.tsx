import { useState } from "react";
import type { Command, GameSnapshot } from "../domain/types";
import { canBid, AUCTION_STEP } from "../domain/market";
import { publicProperty } from "../domain/selectors";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import type { auctionView } from "./viewModel";
import { PanelHost } from "./PanelHost";
import { PropertyDetails } from "./PropertyDetails";
import styles from "./Inspection.module.css";

export function AuctionPanel({ model, snapshot, language, onCommand, onPause }: { model: NonNullable<ReturnType<typeof auctionView>>; snapshot: GameSnapshot; language: Language; onCommand: (command: Command) => void; onPause: () => void }) {
  const [draft, setDraft] = useState(String(model.minimum ?? ""));
  const copy = messages(language).auction;
  const auction = model.auction;
  const property = publicProperty(snapshot, auction.propertyId);
  const amount = /^\d+$/.test(draft) ? Number(draft) : NaN;
  const valid = canBid(snapshot, auction, auction.actorId, amount);
  const bid = model.commands.find((command) => command.kind === "auction_bid");
  const pass = model.commands.find((command) => command.kind === "auction_pass");
  return <PanelHost title={copy.title} onClose={onPause}>
    <section className={styles.panel}>
      <p>{formatMessage(copy.bidder, { actor: playerName(language, auction.actorId, snapshot.config), property: tileName(language, property.tile) })}</p>
      <dl className={styles.values}>
        <dt>{copy.highest}</dt><dd>{auction.highestBidderId === null ? copy.noBid : formatMessage(copy.highestValue, { actor: playerName(language, auction.highestBidderId, snapshot.config), amount: formatCash(language, auction.highestBid) })}</dd>
        <dt>{copy.minimum}</dt><dd>{model.minimum === null ? copy.noLegalBid : formatCash(language, model.minimum)}</dd>
        <dt>{messages(language).assets.cash}</dt><dd>{formatCash(language, model.cash)}</dd>
        {valid && <><dt>{copy.remaining}</dt><dd>{formatCash(language, model.cash - amount)}</dd></>}
      </dl>
      <form onSubmit={(event) => { event.preventDefault(); if (bid && valid) onCommand({ kind: "auction_bid", actor: bid.actor, expectedRevision: bid.expectedRevision, amount }); }}>
        <label className={styles.row}>{copy.amount}<input type="number" inputMode="numeric" required min={model.minimum ?? 0} step={AUCTION_STEP} max={model.cash} value={draft} disabled={!bid} aria-describedby="auction-range" onChange={(event) => setDraft(event.currentTarget.value)} /></label>
        <p id="auction-range">{formatMessage(copy.range, { step: AUCTION_STEP })}</p>
        <button className={styles.primary} disabled={!bid || !valid}>{copy.bid}</button>
      </form>
      <p>{copy.passEffect}</p>
      <button disabled={!pass} onClick={() => { if (pass) onCommand(pass); }}>{copy.pass}</button>
      {!pass && <p>{messages(language).construction.unavailable}</p>}
      <details><summary>{messages(language).assets.details}</summary><PropertyDetails property={property} players={snapshot.config.players} language={language} /></details>
      <button onClick={onPause}>{messages(language).settings.title}</button>
    </section>
  </PanelHost>;
}
