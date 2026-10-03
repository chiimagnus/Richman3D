import { useState } from "react";
import type { PlayerId } from "../domain/types";
import type { playerAssets } from "../domain/selectors";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { PropertyDetails } from "./PropertyDetails";
import styles from "./Inspection.module.css";

export function AssetPanel({ assets, initialPlayer, language, onClose }: { assets: readonly ReturnType<typeof playerAssets>[]; initialPlayer: PlayerId; language: Language; onClose: () => void }) {
  const [selected, setSelected] = useState(initialPlayer);
  const copy = messages(language).assets;
  const current = assets.find((asset) => asset.player.id === selected)!;
  const players = assets.map((asset) => asset.player);
  return <section className={styles.panel}>
    <button onClick={onClose}>{copy.close}</button>
    <label className={styles.row}>{copy.player}<select value={selected} onChange={(event) => setSelected(event.currentTarget.value as PlayerId)}>
      {players.map((player, index) => <option key={player.id} value={player.id}>{formatMessage(copy.seat, { number: index + 1, player: playerName(language, player.id, { players }) })}</option>)}
    </select></label>
    <p>{copy.publicOnly}</p>
    {current.bankrupt && <p>{copy.bankrupt}</p>}
    <dl className={styles.values}>
      <dt>{copy.cash}</dt><dd>{formatCash(language, current.cash)}</dd>
      <dt>{copy.value}</dt><dd>{formatCash(language, current.propertyValue)}</dd>
      <dt>{copy.net}</dt><dd>{formatCash(language, current.netAssets)}</dd>
    </dl>
    <h3>{copy.properties}</h3>
    {current.properties.length ? current.properties.map((property) => <details key={property.tile.id}>
      <summary>{tileName(language, property.tile)}</summary>
      <PropertyDetails property={property} players={players} language={language} />
    </details>) : <p>{copy.empty}</p>}
  </section>;
}
