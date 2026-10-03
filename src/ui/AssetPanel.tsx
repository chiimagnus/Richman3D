import { useState } from "react";
import type { Command, PlayerId } from "../domain/types";
import type { playerAssets } from "../domain/selectors";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { PropertyDetails } from "./PropertyDetails";
import type { assetManagementView } from "./viewModel";
import styles from "./Inspection.module.css";

export function AssetPanel({ assets, initialPlayer, language, management, onCommand, onClose, onTrade }: { assets: readonly ReturnType<typeof playerAssets>[]; initialPlayer: PlayerId; language: Language; management: ReturnType<typeof assetManagementView>; onCommand: (command: Command) => void; onClose: () => void; onTrade?: (() => void) | undefined }) {
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
      <dt>{copy.liquidation}</dt><dd>{formatCash(language, current.liquidationValue)}</dd>
    </dl>
    <h3>{copy.properties}</h3>
    {onTrade && management?.actor === selected && <button id="trade-open" onClick={onTrade}>{messages(language).trade.open}</button>}
    {current.properties.length ? current.properties.map((property) => {
      const options = management?.actor === selected ? management.properties[property.tile.id] : undefined;
      return <details key={property.tile.id} name="asset-property">
        <summary>{tileName(language, property.tile)}</summary>
        <PropertyDetails property={property} players={players} language={language} />
        {options && <PropertyOperations options={options} propertyId={property.tile.id} language={language} onCommand={onCommand} />}
      </details>;
    }) : <p>{copy.empty}</p>}
  </section>;
}

export function PropertyOperations({ options, propertyId, language, onCommand, kinds = ["upgrade", "sell_building", "mortgage", "redeem"] }: { options: NonNullable<ReturnType<typeof assetManagementView>>["properties"][string]; propertyId: string; language: Language; onCommand: (command: Command) => void; kinds?: readonly (keyof NonNullable<ReturnType<typeof assetManagementView>>["properties"][string])[] }) {
  const [kind, setKind] = useState<keyof typeof options>(kinds[0]!);
  const option = options[kind];
  const build = messages(language).construction;
  const copy = messages(language).liquidity;
  const reasons = { ...build.reasons, ...copy.reasons };
  const reason = option.reason ? reasons[option.reason] : !option.command ? build.unavailable : null;
  const preview = option.reason === null && option.nextRent !== null;
  return <section className={styles.operation} aria-label={copy.title}>
    <label className={styles.row}>{copy.operation}<select value={kind} onChange={(event) => setKind(event.currentTarget.value as keyof typeof options)}>
      {kinds.map((value) => <option key={value} value={value}>{copy.choices[value]}</option>)}
    </select></label>
    {preview && <p>{formatMessage(build.rentChange, { current: formatCash(language, option.currentRent), next: formatCash(language, option.nextRent!) })}</p>}
    {preview && <dl className={styles.values}>
      <dt>{kind === "upgrade" ? build.cost : kind === "redeem" ? copy.cost : copy.proceeds}</dt><dd>{formatCash(language, kind === "upgrade" || kind === "redeem" ? option.cost : option.proceeds)}</dd>
      <dt>{copy.remaining}</dt><dd>{formatCash(language, option.remainingCash)}</dd>
      {option.payment > 0 && <><dt>{messages(language).debt.autoPayment}</dt><dd>{formatCash(language, option.payment)}</dd></>}
      {option.loss > 0 && <><dt>{copy.loss}</dt><dd>{formatCash(language, option.loss)}</dd></>}
    </dl>}
    {kind === "mortgage" && preview && <p>{copy.mortgageEffect}</p>}
    <button className={styles.primary} aria-describedby={`property-reason-${propertyId}`} disabled={!option.command} onClick={(event) => {
      if (!option.command) return;
      event.currentTarget.closest("details")?.querySelector("summary")?.focus({ preventScroll: true });
      onCommand(option.command);
    }}>{kind === "upgrade" ? formatMessage(build.upgrade, { cost: formatCash(language, option.cost) }) : formatMessage(copy.actions[kind], { amount: formatCash(language, kind === "redeem" ? option.cost : option.proceeds) })}</button>
    <p id={`property-reason-${propertyId}`}>{reason}</p>
  </section>;
}
