import { isLanguage, type Language } from "../i18n/language";
import type { CameraView } from "../rendering/CameraRig";

export type LookSensitivity = "low" | "standard" | "high";

export type GamePreferences = {
  readonly soundEnabled: boolean;
  readonly lookSensitivity: LookSensitivity;
  readonly language: Language;
  readonly cameraView: CameraView | null;
};

type PreferencesStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "richman3d.preferences.v1";

export const DEFAULT_PREFERENCES: GamePreferences = {
  soundEnabled: true,
  lookSensitivity: "standard",
  language: "zh-CN",
  cameraView: null,
};

export function loadPreferences(
  storage?: PreferencesStorage,
): GamePreferences {
  try {
    const raw = (storage ?? window.localStorage).getItem(STORAGE_KEY);
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
      cameraView: value.cameraView === "overview" || value.cameraView === "first_person" ? value.cameraView : null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  preferences: GamePreferences,
  storage?: PreferencesStorage,
): void {
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(preferences));
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
