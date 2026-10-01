export type LookSensitivity = "low" | "standard" | "high";

export type GamePreferences = {
  readonly soundEnabled: boolean;
  readonly lookSensitivity: LookSensitivity;
};

type PreferencesStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "richman3d.preferences.v1";

export const DEFAULT_PREFERENCES: GamePreferences = {
  soundEnabled: true,
  lookSensitivity: "standard",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
