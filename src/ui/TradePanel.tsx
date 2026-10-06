import { useState } from "react";
import type { Command, GameSnapshot, PlayerId, TradeTerms } from "../domain/types";
import { tradeOption, tradePropertyReason } from "../domain/market";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { PanelHost } from "./PanelHost";
import { tradeTermsText } from "./eventText";
import styles from "./Inspection.module.css";

function TradePreview({ option, snapshot, language }: { option: ReturnType<typeof tradeOption>; snapshot: GameSnapshot; language: Language }) {
  const copy = messages(language).trade;
  if (option.reason !== null) return <p id="trade-reason">{copy.reasons[option.reason]}</p>;
  const names = (ids: readonly string[]) => ids.map((id) => tileName(language, snapshot.map.tiles.find((tile) => tile.id === id)!)).join(messages(language).setup.nameSeparator) || copy.none;
  const groups = (ids: readonly (keyof typeof copy.groups)[]) => ids.map((id) => copy.groups[id]).join(messages(language).setup.nameSeparator) || copy.none;
  return <div id="trade-reason">{option.sides.map((side) => <section key={side.id}>
    <h3>{playerName(language, side.id, snapshot.config)}</h3>
    <dl className={styles.values}>
      <dt>{copy.give}</dt><dd>{names(side.given)}</dd>
      <dt>{copy.receive}</dt><dd>{names(side.received)}</dd>
      <dt>{copy.cashBefore}</dt><dd>{formatCash(language, side.cashBefore)}</dd>
      <dt>{copy.cashAfter}</dt><dd>{formatCash(language, side.cashAfter)}</dd>
      <dt>{copy.groupsBefore}</dt><dd>{groups(side.groupsBefore)}</dd>
      <dt>{copy.groupsAfter}</dt><dd>{groups(side.groupsAfter)}</dd>
    </dl>
  </section>)}</div>;
}

export function TradeDraft({ snapshot, language, enabled, onCommand, onClose }: { snapshot: GameSnapshot; language: Language; enabled: boolean; onCommand: (command: Command) => void; onClose: () => void }) {
  const proposerId = snapshot.turnPlayerId;
  const recipients = snapshot.players.filter((player) => !player.bankrupt && player.id !== proposerId);
  const [recipientId, setRecipient] = useState(recipients[0]!.id);
  const [give, setGive] = useState<readonly string[]>([]);
  const [receive, setReceive] = useState<readonly string[]>([]);
  const [payer, setPayer] = useState<"none" | "proposer" | "recipient">("none");
  const [amount, setAmount] = useState("");
  const copy = messages(language).trade;
  const value = /^\d+$/.test(amount) ? Number(amount) : NaN;
  const terms: TradeTerms = { recipientId, givePropertyIds: give, receivePropertyIds: receive, cash: payer === "none" ? null : { payerId: payer === "proposer" ? proposerId : recipientId, amount: value } };
  const option = tradeOption(snapshot, proposerId, terms);
  const choose = (owner: PlayerId, selected: readonly string[], setSelected: (ids: readonly string[]) => void, title: string) => <fieldset className={styles.tradeProperties}>
    <legend>{title}</legend>
    {snapshot.map.tiles.filter((tile) => tile.type === "property" && snapshot.properties[tile.id]!.ownerId === owner).map((tile) => {
      const reason = tradePropertyReason(snapshot, owner, tile.id);
      return <label key={tile.id}><input type="checkbox" value={tile.id} checked={selected.includes(tile.id)} disabled={!enabled || reason !== null || selected.length >= 3 && !selected.includes(tile.id)} onChange={(event) => setSelected(event.currentTarget.checked ? [...selected, tile.id] : selected.filter((id) => id !== tile.id))} /><span>{tileName(language, tile)}{reason ? " — " + copy.reasons[reason] : ""}</span></label>;
    })}
  </fieldset>;
  return <PanelHost title={copy.title} onClose={onClose}>
    <section className={styles.panel}><form onSubmit={(event) => { event.preventDefault(); if (enabled && option.reason === null) onCommand({ kind: "trade_propose", actor: proposerId, expectedRevision: snapshot.revision, terms }); }}>
      <label className={styles.row}>{copy.recipient}<select value={recipientId} disabled={!enabled} onChange={(event) => { setRecipient(event.currentTarget.value as PlayerId); setReceive([]); }}>
        {recipients.map((player) => <option key={player.id} value={player.id}>{playerName(language, player.id, snapshot.config)}</option>)}
      </select></label>
      <p>{formatMessage(copy.limit, { limit: 3 })}</p>
      {choose(proposerId, give, setGive, copy.give)}{choose(recipientId, receive, setReceive, copy.receive)}
      <label className={styles.row}>{copy.cashDirection}<select value={payer} disabled={!enabled} onChange={(event) => setPayer(event.currentTarget.value as typeof payer)}>
        <option value="none">{copy.noCash}</option>
        <option value="proposer">{formatMessage(copy.cashTransfer, { payer: playerName(language, proposerId, snapshot.config), receiver: playerName(language, recipientId, snapshot.config), amount: "" })}</option>
        <option value="recipient">{formatMessage(copy.cashTransfer, { payer: playerName(language, recipientId, snapshot.config), receiver: playerName(language, proposerId, snapshot.config), amount: "" })}</option>
      </select></label>
      {payer !== "none" && <label className={styles.row}>{copy.cashAmount}<input type="number" inputMode="numeric" min={1} max={snapshot.players.find((player) => player.id === (payer === "proposer" ? proposerId : recipientId))!.cash} step={1} required value={amount} disabled={!enabled} onChange={(event) => setAmount(event.currentTarget.value)} /></label>}
      <TradePreview option={option} snapshot={snapshot} language={language} />
      <p>{copy.effect}</p>
      <button className={styles.primary} aria-describedby="trade-reason" disabled={!enabled || option.reason !== null}>{copy.submit}</button>
      {!enabled && <p>{messages(language).construction.unavailable}</p>}
    </form><button onClick={onClose}>{copy.cancel}</button></section>
  </PanelHost>;
}

export function TradePanel({ snapshot, language, commands, onCommand, onPause }: { snapshot: GameSnapshot; language: Language; commands: readonly Command[]; onCommand: (command: Command) => void; onPause: () => void }) {
  if (snapshot.decision.kind !== "awaiting_trade") return null;
  const proposal = snapshot.decision.proposal;
  const copy = messages(language).trade;
  const option = tradeOption(snapshot, proposal.proposerId, proposal);
  const accept = commands.find((command) => command.kind === "trade_accept");
  const reject = commands.find((command) => command.kind === "trade_reject");
  return <PanelHost title={copy.title} onClose={onPause}>
    <section className={styles.panel}>
      <p>{formatMessage(copy.respond, { proposer: playerName(language, proposal.proposerId, snapshot.config), recipient: playerName(language, proposal.recipientId, snapshot.config) })}</p>
      <p>{tradeTermsText(language, proposal, snapshot)}</p>
      <TradePreview option={option} snapshot={snapshot} language={language} />
      <button className={styles.primary} aria-describedby="trade-reason" disabled={!accept} onClick={() => { if (accept) onCommand(accept); }}>{copy.accept}</button>
      <button disabled={!reject} onClick={() => { if (reject) onCommand(reject); }}>{copy.reject}</button>
      {!reject && <p>{messages(language).construction.unavailable}</p>}
      <button onClick={onPause}>{messages(language).settings.title}</button>
    </section>
  </PanelHost>;
}
