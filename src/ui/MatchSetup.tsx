import { useState } from "react";
import type { GameApp } from "../app/GameApp";
import { createMatchConfig, normalizeName, SEAT_COLORS } from "../domain/config";
import { QUICK_RULES, STANDARD_RULES, rulesFor } from "../domain/rules";
import { mapFor } from "../domain/maps";
import { chanceCardText, formatMessage, messages } from "../i18n";
import { PanelHost } from "./PanelHost";
import styles from "./MatchSetup.module.css";

export function MatchSetup({ app, onClose }: { app: GameApp; onClose: () => void }) {
  const language = app.getSnapshot().preferences.language;
  const copy = messages(language).setup;
  const [names, setNames] = useState(["", ""]);
  const [colors, setColors] = useState<string[]>([SEAT_COLORS[0], SEAT_COLORS[1]]);
  const [version, setVersion] = useState(QUICK_RULES.version);
  const [error, setError] = useState(false);
  const rules = rulesFor(version);
  const defaultConfig = createMatchConfig();
  const map = mapFor(defaultConfig.mapId, defaultConfig.mapVersion);
  return <PanelHost title={copy.title} onClose={onClose}>
    <form onSubmit={(event) => {
      event.preventDefault();
      try {
        const config = createMatchConfig(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1);
        const players = config.players.map((player, index) => ({ ...player, name: normalizeName(names[index]!), color: colors[index]! }));
        void app.start({ ...config, players, rulesVersion: version });
        onClose();
      } catch { setError(true); }
    }}>
      {(["p1", "p2"] as const).map((id, index) => <label className={styles.row} key={id}>{copy.names[index === 0 ? "local" : "computer"]}
        <input data-name={id} value={names[index]} placeholder={messages(language).players[id]} onChange={(event) => { const next = [...names]; next[index] = event.currentTarget.value; setNames(next); setError(false); }} />
      </label>)}
      <label className={styles.row}>{copy.length}<select data-length value={version} onChange={(event) => setVersion(event.currentTarget.value)}>
        <option value={QUICK_RULES.version}>{formatMessage(copy.quick, { rounds: QUICK_RULES.roundLimit })}</option>
        <option value={STANDARD_RULES.version}>{formatMessage(copy.standard, { rounds: STANDARD_RULES.roundLimit })}</option>
      </select></label>
      <p>{formatMessage(copy.moneyRules, { cash: rules.startingCash, bonus: rules.passStartBonus })}</p>
      <details><summary>{copy.advanced}</summary>
        <p>{formatMessage(copy.city, { spaces: map.tiles.length })}</p>
        {([0, 1] as const).map((index) => <label className={styles.row} key={index}>{formatMessage(copy.color, { player: messages(language).players[index === 0 ? "p1" : "p2"] })}
          <select data-color={index} value={colors[index]} onChange={(event) => { const next = [...colors]; next[index] = event.currentTarget.value; setColors(next); }}>
            {SEAT_COLORS.map((color, colorIndex) => <option key={color} value={color}>{Object.values(copy.colors)[colorIndex]}</option>)}
          </select>
        </label>)}
        <ul>{rules.chanceCards.map((card) => <li key={card.id}>{chanceCardText(language, card.id, card.amount)}</li>)}</ul>
      </details>
      {error && <p role="alert">{copy.nameError}</p>}
      <button data-launch type="submit">{copy.launch}</button><button type="button" onClick={onClose}>{copy.cancel}</button>
    </form>
  </PanelHost>;
}
