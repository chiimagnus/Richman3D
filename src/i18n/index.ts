import type { BoardTile } from "../domain/board";
import type { ChanceCardId, MatchConfig, MatchResult, PlayerId } from "../domain/types";
import { playerConfig } from "../domain/config";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import type { Language } from "./language";

export type Messages = typeof zhCN;
type MessageValues = Readonly<Record<string, string | number>>;

const LOCALES: Record<Language, Messages> = {
  "zh-CN": zhCN,
  en,
};

export function messages(language: Language): Messages {
  return LOCALES[language];
}

export function formatMessage(
  template: string,
  values: MessageValues = {},
): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`缺少国际化占位符: ${key} (${placeholder})`);
    }
    return String(value);
  });
}

export function playerName(language: Language, playerId: PlayerId, config: Pick<MatchConfig, "players">): string {
  const player = playerConfig(config, playerId);
  return player.name ?? messages(language).players[player.defaultNameKey];
}

export function resultTitle(language: Language, result: MatchResult, config: MatchConfig): string {
  return formatMessage(result.winnerIds.length > 1 ? messages(language).setup.tied : messages(language).status.winner, {
    playerName: result.winnerIds.map((id) => playerName(language, id, config)).join(messages(language).setup.nameSeparator),
  });
}

export function tileName(language: Language, tile: BoardTile): string {
  const name = (messages(language).board.tiles as Record<string, string>)[tile.id];
  if (!name) {
    throw new Error(`缺少地块翻译: ${tile.id}`);
  }
  return name;
}

export function chanceCardText(language: Language, cardId: ChanceCardId, amount: number): string {
  return formatMessage(messages(language).chanceCards[cardId], { amount });
}

export function formatCash(language: Language, value: number): string {
  const sign = value < 0 ? "−" : "";
  const locale = language === "en" ? "en-US" : "zh-CN";
  return `${sign}¥${Math.abs(value).toLocaleString(locale)}`;
}
