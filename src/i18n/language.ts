export type Language = "zh-CN" | "en";

export function isLanguage(value: unknown): value is Language {
  return value === "zh-CN" || value === "en";
}
