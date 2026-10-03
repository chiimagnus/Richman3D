import type { PlayerConfig } from "../domain/types";
import type { publicProperty } from "../domain/selectors";
import { formatCash, messages, playerName } from "../i18n";
import type { Language } from "../i18n/language";
import styles from "./Inspection.module.css";

export function PropertyDetails({ property, players, language }: { property: ReturnType<typeof publicProperty>; players: readonly PlayerConfig[]; language: Language }) {
  const copy = messages(language).assets;
  return <dl className={styles.values} data-property-details={property.tile.id}>
    <dt>{copy.owner}</dt><dd>{property.ownerId ? playerName(language, property.ownerId, { players }) : copy.bank}</dd>
    <dt>{property.ownerId ? copy.value : copy.price}</dt><dd>{formatCash(language, property.tile.price)}</dd>
    <dt>{copy.rent}</dt><dd>{formatCash(language, property.tile.rent)}</dd>
  </dl>;
}
