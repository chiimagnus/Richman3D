import { useState } from "react";
import type { CardInstanceId, Command, GameReadSnapshot, ItemCardId, PlayerId } from "../domain/types";
import { cardType, CONTROLLED_TOTALS, HAND_LIMIT } from "../domain/cards";
import { chanceCardText, formatMessage, messages, playerName } from "../i18n";
import type { Language } from "../i18n/language";
import { PanelHost } from "./PanelHost";
import styles from "./Inspection.module.css";

export function HandPanel({ snapshot, actor, commands, language, onCommand, onClose }: {
  snapshot: GameReadSnapshot; actor: PlayerId; commands: readonly Command[]; language: Language;
  onCommand: (command: Command) => void; onClose: () => void;
}) {
  const copy = messages(language).items;
  const hand = snapshot.players.find((player) => player.id === actor)!.hand;
  const discarding = snapshot.decision.kind === "awaiting_discard" && snapshot.decision.actorId === actor;
  const [selected, setSelected] = useState<CardInstanceId | null>(hand?.[0] ?? null);
  const [draft, setDraft] = useState(false);
  const [total, setTotal] = useState(7);
  const targets = snapshot.players.filter((player) => !player.bankrupt && player.id !== actor);
  const [targetId, setTargetId] = useState<PlayerId | null>(targets[0]?.id ?? null);
  const type = selected ? cardType(selected) as ItemCardId : null;
  const choices = commands.filter((command) => "instanceId" in command && command.instanceId === selected);
  const command = choices.find((command) => command.kind === "discard_item" || command.kind === "use_item" &&
    (type !== "controlled-dice" || command.total === total) && (type !== "swap-positions" || command.targetId === targetId));
  const reason = !discarding && !command ? snapshot.itemUsed ? copy.used : snapshot.decision.kind !== "awaiting_roll" || snapshot.decision.actorId !== actor ? copy.beforeRoll : copy.busy : null;
  if (hand === null) return null;
  return <PanelHost title={discarding ? formatMessage(copy.discardTitle, { limit: HAND_LIMIT }) : copy.title} onClose={() => { if (draft) setDraft(false); else onClose(); }}>
    <div className={styles.panel}>
      {discarding && <p>{formatMessage(copy.discardReason, { limit: HAND_LIMIT, next: HAND_LIMIT + 1 })}</p>}
      {snapshot.activeItem?.actorId === actor && <p>{formatMessage(copy.active, { card: copy.names[cardType(snapshot.activeItem.instanceId) as ItemCardId] })}</p>}
      {hand.length === 0 ? <p>{copy.empty}</p> : <>
        {!draft && <label className={styles.row}>{copy.select}<select value={selected ?? ""} onChange={(event) => setSelected(event.currentTarget.value as CardInstanceId)}>
          {hand.map((id, index) => <option key={id} value={id}>{index + 1}. {copy.names[cardType(id) as ItemCardId]}{discarding && index === hand.length - 1 ? ` · ${copy.newItem}` : ""}</option>)}
        </select></label>}
        {type && <p>{chanceCardText(language, type, 0, 0, type === "tax-discount" ? snapshot.rules.taxDiscountPercent : snapshot.rules.constructionDiscountPercent, CONTROLLED_TOTALS)}</p>}
        {draft && type === "controlled-dice" && <label className={styles.row}>{copy.total}<select value={total} onChange={(event) => setTotal(Number(event.currentTarget.value))}>
          {Array.from({ length: CONTROLLED_TOTALS.max - CONTROLLED_TOTALS.min + 1 }, (_, index) => <option key={index} value={index + CONTROLLED_TOTALS.min}>{index + CONTROLLED_TOTALS.min}</option>)}
        </select></label>}
        {draft && type === "swap-positions" && <label className={styles.row}>{copy.target}<select value={targetId ?? ""} onChange={(event) => setTargetId(event.currentTarget.value as PlayerId)}>
          {targets.map((player) => <option key={player.id} value={player.id}>{playerName(language, player.id, snapshot.config)}</option>)}
        </select></label>}
        {reason && <p>{reason}</p>}
        <button className={styles.primary} disabled={!command} onClick={() => {
          if (!command) return;
          if (!discarding && !draft && (type === "controlled-dice" || type === "swap-positions")) setDraft(true);
          else onCommand(command);
        }}>{discarding ? copy.discard : draft ? copy.confirm : copy.use}</button>
        {draft && <button onClick={() => setDraft(false)}>{copy.cancel}</button>}
      </>}
      <button onClick={onClose}>{discarding ? messages(language).settings.title : copy.close}</button>
    </div>
  </PanelHost>;
}
