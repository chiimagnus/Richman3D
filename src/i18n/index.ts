import type { BoardTile } from "../domain/board";
import type { ChanceCardId, PlayerId } from "../domain/types";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import type { Language } from "../settings/preferences";

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

export function playerName(language: Language, playerId: PlayerId): string {
  return messages(language).players[playerId];
}

export function tileName(language: Language, tile: BoardTile): string {
  const name = messages(language).board.tiles[tile.id];
  if (!name) {
    throw new Error(`缺少地块翻译: ${tile.id}`);
  }
  return name;
}

export function chanceCardText(language: Language, cardId: ChanceCardId): string {
  return messages(language).chanceCards[cardId];
}

export function formatCash(language: Language, value: number): string {
  const sign = value < 0 ? "−" : "";
  const locale = language === "en" ? "en-US" : "zh-CN";
  return `${sign}¥${Math.abs(value).toLocaleString(locale)}`;
}
