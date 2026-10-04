import type { GameSnapshot, PlayerConfig } from "../domain/types";
import type { BoardTile } from "../domain/board";
import { publicProperty } from "../domain/selectors";
import { formatCash, formatMessage, messages, playerName } from "../i18n";
import type { Language } from "../i18n/language";
import styles from "./Inspection.module.css";

export function PropertyDetails({ property, players, language }: { property: ReturnType<typeof publicProperty>; players: readonly PlayerConfig[]; language: Language }) {
  const copy = messages(language).assets;
  return <dl className={styles.values}>
    <dt>{copy.owner}</dt><dd>{property.ownerId ? formatMessage(copy.seat, { number: players.findIndex((player) => player.id === property.ownerId) + 1, player: playerName(language, property.ownerId, { players }) }) : copy.bank}</dd>
    <dt>{property.ownerId ? copy.value : copy.price}</dt><dd>{formatCash(language, property.ownerId ? property.bookValue : property.tile.price)}</dd>
    <dt>{copy.rent}</dt><dd>{formatCash(language, property.rent)}</dd>
    {property.ownerId && <>
      <dt>{copy.level}</dt><dd>{property.level}</dd>
      <dt>{copy.groupBonus}</dt><dd>{property.groupComplete ? copy.groupActive : copy.groupInactive}</dd>
      <dt>{copy.mortgagePrincipal}</dt><dd>{formatCash(language, property.mortgagePrincipal)}</dd>
      <dt>{copy.liquidation}</dt><dd>{formatCash(language, property.liquidationValue)}</dd>
    </>}
  </dl>;
}

export function TileDetails({ snapshot, tile, language }: { snapshot: GameSnapshot; tile: BoardTile; language: Language }) {
  if (tile.type === "property") return <PropertyDetails property={publicProperty(snapshot, tile.id)} players={snapshot.config.players} language={language} />;
  const copy = messages(language);
  return tile.type === "chance" ? <p>{copy.board.chanceDetail}</p> : <dl className={styles.values}>
    <dt>{tile.type === "start" ? copy.board.startReward : copy.board.fixedFee}</dt>
    <dd>{formatCash(language, tile.type === "start" ? snapshot.rules.passStartBonus : tile.amount)}</dd>
  </dl>;
}
