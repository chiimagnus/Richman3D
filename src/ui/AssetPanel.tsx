import { useState } from "react";
import type { Command, PlayerId } from "../domain/types";
import type { playerAssets } from "../domain/selectors";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { PropertyDetails } from "./PropertyDetails";
import type { assetManagementView } from "./viewModel";
import styles from "./Inspection.module.css";

export function AssetPanel({ assets, initialPlayer, language, management, onCommand, onClose }: { assets: readonly ReturnType<typeof playerAssets>[]; initialPlayer: PlayerId; language: Language; management: ReturnType<typeof assetManagementView>; onCommand: (command: Command) => void; onClose: () => void }) {
  const [selected, setSelected] = useState(initialPlayer);
  const copy = messages(language).assets;
  const current = assets.find((asset) => asset.player.id === selected)!;
  const players = assets.map((asset) => asset.player);
  const build = messages(language).construction;
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
      <dt>{copy.liquidation}</dt><dd>{formatCash(language, current.liquidationValue)}</dd>
    </dl>
    <h3>{copy.properties}</h3>
    {current.properties.length ? current.properties.map((property) => {
      const option = management?.actor === selected ? management.properties[property.tile.id] : undefined;
      const reason = option?.reason ? build.reasons[option.reason] : option && !option.command ? build.unavailable : null;
      return <details key={property.tile.id} name="asset-property">
        <summary>{tileName(language, property.tile)}</summary>
        <PropertyDetails property={property} players={players} language={language} />
        {option && <section className={styles.operation} aria-label={build.title}>
          {option.nextRent !== null && <>
            <p>{formatMessage(build.rentChange, { current: formatCash(language, option.currentRent), next: formatCash(language, option.nextRent) })}</p>
            <dl className={styles.values}>
              <dt>{build.cost}</dt><dd>{formatCash(language, option.cost)}</dd>
              <dt>{build.remaining}</dt><dd>{formatCash(language, option.remainingCash)}</dd>
            </dl>
          </>}
          <button className={styles.primary} aria-describedby={`build-reason-${property.tile.id}`} disabled={!option.command} onClick={(event) => {
            if (!option.command) return;
            event.currentTarget.closest("details")?.querySelector("summary")?.focus({ preventScroll: true });
            onCommand(option.command);
          }}>{formatMessage(build.upgrade, { cost: formatCash(language, option.cost) })}</button>
          <p id={`build-reason-${property.tile.id}`}>{reason}</p>
        </section>}
      </details>;
    }) : <p>{copy.empty}</p>}
  </section>;
}
