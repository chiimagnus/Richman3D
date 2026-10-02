export type LookSensitivity = "low" | "standard" | "high";
export type Language = "zh-CN" | "en";

export type GamePreferences = {
  readonly soundEnabled: boolean;
  readonly lookSensitivity: LookSensitivity;
  readonly language: Language;
};

type PreferencesStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "richman3d.preferences.v1";

export const DEFAULT_PREFERENCES: GamePreferences = {
  soundEnabled: true,
  lookSensitivity: "standard",
  language: "zh-CN",
};

export function loadPreferences(
  storage: PreferencesStorage = window.localStorage,
): GamePreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }

    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) {
      return { ...DEFAULT_PREFERENCES };
    }

    return {
      soundEnabled:
        typeof value.soundEnabled === "boolean"
          ? value.soundEnabled
          : DEFAULT_PREFERENCES.soundEnabled,
      lookSensitivity: isLookSensitivity(value.lookSensitivity)
        ? value.lookSensitivity
        : DEFAULT_PREFERENCES.lookSensitivity,
      language: isLanguage(value.language)
        ? value.language
        : DEFAULT_PREFERENCES.language,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  preferences: GamePreferences,
  storage: PreferencesStorage = window.localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 浏览器拒绝持久化时，当前会话仍继续使用内存中的设置。
  }
}

export function lookSensitivityScale(
  sensitivity: LookSensitivity,
): number {
  switch (sensitivity) {
    case "low":
      return 0.7;
    case "standard":
      return 1;
    case "high":
      return 1.35;
  }
}

function isLookSensitivity(value: unknown): value is LookSensitivity {
  return value === "low" || value === "standard" || value === "high";
}

export function isLanguage(value: unknown): value is Language {
  return value === "zh-CN" || value === "en";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
