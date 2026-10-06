import type { Command, GameSnapshot } from "../domain/types";
import { formatCash, formatMessage, messages, playerName, tileName } from "../i18n";
import type { Language } from "../i18n/language";
import { PropertyOperations } from "./AssetPanel";
import { PropertyDetails } from "./PropertyDetails";
import { PanelHost } from "./PanelHost";
import { debtSourceText } from "./eventText";
import type { debtView } from "./viewModel";
import styles from "./Inspection.module.css";

export function DebtPanel({ model, snapshot, language, onCommand, onPause }: { model: NonNullable<ReturnType<typeof debtView>>; snapshot: GameSnapshot; language: Language; onCommand: (command: Command) => void; onPause: () => void }) {
  const copy = messages(language).debt;
  const assetsCopy = messages(language).assets;
  const creditor = model.debt.creditorId === null ? assetsCopy.bank : playerName(language, model.debt.creditorId, snapshot.config);
  return <PanelHost title={copy.title}>
    <section className={styles.panel}>
      <p>{formatMessage(copy.obligation, { actor: playerName(language, model.actor, snapshot.config), creditor, amount: formatCash(language, model.debt.amount) })}</p>
      <p>{debtSourceText(language, model.debt, snapshot)}</p>
      <dl className={styles.values}>
        <dt>{assetsCopy.cash}</dt><dd>{formatCash(language, model.assets.cash)}</dd>
        <dt>{copy.shortfall}</dt><dd>{formatCash(language, model.shortfall)}</dd>
        <dt>{assetsCopy.liquidation}</dt><dd>{formatCash(language, model.assets.liquidationValue)}</dd>
      </dl>
      {!model.insolvent && <p>{copy.automatic}</p>}
      <h3>{assetsCopy.properties}</h3>
      {model.assets.properties.length ? model.assets.properties.map((property) => {
        const options = model.management?.actor === model.actor ? model.management.properties[property.tile.id] : undefined;
        return <details key={property.tile.id} name="debt-property"><summary>{tileName(language, property.tile)}</summary>
          <PropertyDetails property={property} players={snapshot.config.players} language={language} />
          {options && property.level > 0 && <PropertyOperations options={options} propertyId={property.tile.id} language={language} onCommand={onCommand} kinds={["sell_building"]} />}
        </details>;
      }) : <p>{assetsCopy.empty}</p>}
      {model.insolvent ? <><p>{copy.insolvent}</p><button className={styles.primary} disabled={!model.bankruptcy} onClick={() => { if (model.bankruptcy) onCommand(model.bankruptcy); }}>{copy.bankrupt}</button>{!model.bankruptcy && <p>{messages(language).construction.unavailable}</p>}</> : <p>{copy.solvent}</p>}
      <button onClick={onPause}>{messages(language).settings.title}</button>
    </section>
  </PanelHost>;
}
