import type { MapDefinition } from "../domain/board";
import type { RuleSet } from "../domain/rules";
import type { Language } from "../i18n/language";
import { formatCash, formatMessage, messages, tileName } from "../i18n";
import styles from "./MapPreview.module.css";

export function MapPreview({ map, rules, language }: { map: MapDefinition; rules: RuleSet; language: Language }) {
  const copy = messages(language);
  const description = copy.maps.definitions[map.id as keyof typeof copy.maps.definitions];
  const minX = Math.min(...map.path.map((point) => point.x));
  const minZ = Math.min(...map.path.map((point) => point.z));
  const width = Math.max(...map.path.map((point) => point.x)) - minX;
  const height = Math.max(...map.path.map((point) => point.z)) - minZ;
  return <section className={styles.preview} aria-label={copy.maps.preview}>
    <h3>{formatMessage(copy.maps.heading, { name: description.name, spaces: map.tiles.length })}</h3>
    <p>{description.description}</p>
    <svg viewBox={`${minX - 2} ${minZ - 2} ${width + 4} ${height + 4}`} aria-hidden="true" className={styles.layout}>
      {map.path.map((point, index) => <g key={map.tiles[index]!.id}>
        <rect x={point.x - 1.8} y={point.z - 1.8} width="3.6" height="3.6" rx="0.6" />
        <text x={point.x} y={point.z} textAnchor="middle" dominantBaseline="central">{index + 1}</text>
      </g>)}
    </svg>
    <details><summary>{copy.maps.prices}</summary>
      <ol className={styles.prices}>
        {map.tiles.map((tile) => <li key={tile.id}>
          <strong>{tileName(language, tile)}</strong>
          <span>{tile.type === "property" ? formatMessage(copy.board.propertyDetail, { price: formatCash(language, tile.price), rent: formatCash(language, tile.rent) })
            : tile.type === "start" ? formatMessage(copy.board.startDetail, { amount: formatCash(language, rules.passStartBonus) })
            : tile.type === "tax" ? `${copy.board.fixedFee} ${formatCash(language, tile.amount)}` : copy.board.chanceDetail}</span>
          {tile.type === "property" && <span>{copy.trade.groups[tile.group]}</span>}
        </li>)}
      </ol>
    </details>
  </section>;
}
