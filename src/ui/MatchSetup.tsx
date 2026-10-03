import { useState } from "react";
import type { GameApp } from "../app/GameApp";
import { createMatchConfig, normalizeName, SEAT_COLORS, SEAT_IDS } from "../domain/config";
import { QUICK_RULES, STANDARD_RULES, rulesFor } from "../domain/rules";
import { mapFor } from "../domain/maps";
import { chanceCardText, formatMessage, messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import styles from "./MatchSetup.module.css";

export function MatchSetup({ app, onClose }: { app: GameApp; onClose: () => void }) {
  const language = app.getSnapshot().preferences.language;
  const copy = messages(language).setup;
  const [names, setNames] = useState(SEAT_IDS.map(() => ""));
  const [colors, setColors] = useState<string[]>([...SEAT_COLORS]);
  const [seats, setSeats] = useState(2);
  const [humans, setHumans] = useState(1);
  const [version, setVersion] = useState(QUICK_RULES.version);
  const [error, setError] = useState(false);
  const rules = rulesFor(version);
  const defaultConfig = createMatchConfig();
  const map = mapFor(defaultConfig.mapId, defaultConfig.mapVersion);
  return <PanelHost title={copy.title} onClose={onClose}>
    <form onSubmit={(event) => {
      event.preventDefault();
      try {
        const config = createMatchConfig(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1, seats);
        const players = config.players.map((player, index) => ({ ...player, controller: index < humans ? "human" as const : "bot" as const, name: normalizeName(names[index]!), color: colors[index]! }));
        void app.start({ ...config, players, rulesVersion: version });
        onClose();
      } catch { setError(true); }
    }}>
      <label className={styles.row}>{copy.seats}<select value={seats} onChange={(event) => { const count = Number(event.currentTarget.value); setSeats(count); setHumans(Math.min(humans, count)); }}>
        {[2, 3, 4].map((count) => <option key={count} value={count}>{formatMessage(copy.seatOption, { count })}</option>)}
      </select></label>
      <label className={styles.row}>{copy.humans}<select value={humans} onChange={(event) => setHumans(Number(event.currentTarget.value))}>
        {Array.from({ length: seats }, (_, index) => <option key={index} value={index + 1}>{formatMessage(copy.humanOption, { count: index + 1 })}</option>)}
      </select></label>
      {SEAT_IDS.slice(0, seats).map((id, index) => <label className={styles.row} key={id}>{formatMessage(index < humans ? copy.humanSeat : copy.computerSeat, { number: index < humans ? index + 1 : index - humans + 1 })}
        <input value={names[index]} placeholder={messages(language).players[id]} onChange={(event) => { const next = [...names]; next[index] = event.currentTarget.value; setNames(next); setError(false); }} />
      </label>)}
      <label className={styles.row}>{copy.length}<select value={version} onChange={(event) => setVersion(event.currentTarget.value)}>
        <option value={QUICK_RULES.version}>{formatMessage(copy.quick, { rounds: QUICK_RULES.roundLimit })}</option>
        <option value={STANDARD_RULES.version}>{formatMessage(copy.standard, { rounds: STANDARD_RULES.roundLimit })}</option>
      </select></label>
      <p>{formatMessage(copy.moneyRules, { cash: rules.startingCash, bonus: rules.passStartBonus })}</p>
      <details><summary>{copy.advanced}</summary>
        <p>{formatMessage(copy.city, { spaces: map.tiles.length })}</p>
        {SEAT_IDS.slice(0, seats).map((id, index) => <label className={styles.row} key={id}>{formatMessage(copy.color, { player: messages(language).players[id] })}
          <select value={colors[index]} onChange={(event) => { const next = [...colors]; next[index] = event.currentTarget.value; setColors(next); }}>
            {SEAT_COLORS.map((color, colorIndex) => <option key={color} value={color}>{Object.values(copy.colors)[colorIndex]}</option>)}
          </select>
        </label>)}
        <ul>{rules.chanceCards.map((card) => <li key={card.id}>{chanceCardText(language, card.id, card.kind === "cash" ? card.amount : rules.passStartBonus, card.kind === "move" ? card.steps : 0)}</li>)}</ul>
      </details>
      {error && <p role="alert">{copy.nameError}</p>}
      {app.getSnapshot().stored.kind === "valid" && <p>{messages(language).storage.replaceWarning}</p>}
      <button type="submit">{copy.launch}</button><button type="button" onClick={onClose}>{copy.cancel}</button>
    </form>
  </PanelHost>;
}
