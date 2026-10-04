import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  lookSensitivityScale,
  savePreferences,
} from "../../src/settings/preferences";

function memoryStorage(initial: string | null = null) {
  let value = initial;

  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
    read: () => value,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("game preferences", () => {
  it("protects the storage getter as well as getItem/setItem", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("SecurityError"); } });
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences(DEFAULT_PREFERENCES)).not.toThrow();
  });
  it("uses defaults when nothing is stored", () => {
    const storage = memoryStorage();

    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it("loads valid persisted preferences", () => {
    const storage = memoryStorage(
      JSON.stringify({
        soundEnabled: false,
        lookSensitivity: "high",
        language: "en",
      }),
    );

    expect(loadPreferences(storage)).toEqual({
      soundEnabled: false,
      lookSensitivity: "high",
      language: "en",
      cameraView: null,
    });
  });

  it("keeps older saved preferences and adds the default language", () => {
    const storage = memoryStorage(
      JSON.stringify({
        soundEnabled: false,
        lookSensitivity: "high",
      }),
    );

    expect(loadPreferences(storage)).toEqual({
      soundEnabled: false,
      lookSensitivity: "high",
      language: "zh-CN",
      cameraView: null,
    });
  });

  it("falls back per field when stored data is invalid", () => {
    const storage = memoryStorage(
      JSON.stringify({
        soundEnabled: "yes",
        lookSensitivity: "turbo",
        language: "fr",
      }),
    );

    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences(memoryStorage("{broken"))).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it("saves preferences as one versioned payload", () => {
    const storage = memoryStorage();

    savePreferences(
      {
        soundEnabled: false,
        lookSensitivity: "low",
        language: "en",
        cameraView: "overview",
      },
      storage,
    );

    expect(JSON.parse(storage.read() ?? "null")).toEqual({
      soundEnabled: false,
      lookSensitivity: "low",
      language: "en",
      cameraView: "overview",
    });
  });

  it("keeps the game usable when browser storage is unavailable", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(loadPreferences(unavailableStorage)).toEqual(DEFAULT_PREFERENCES);
    expect(() =>
      savePreferences(DEFAULT_PREFERENCES, unavailableStorage),
    ).not.toThrow();
  });

  it("maps the three sensitivity levels to pointer speed", () => {
    expect(lookSensitivityScale("low")).toBe(0.7);
    expect(lookSensitivityScale("standard")).toBe(1);
    expect(lookSensitivityScale("high")).toBe(1.35);
  });

  it.each(["first_person", "overview"] as const)("persists the explicit %s choice without overriding other valid preferences", (cameraView) => {
    const storage = memoryStorage();
    const preferences = { ...DEFAULT_PREFERENCES, cameraView, soundEnabled: false, language: "en" as const };
    savePreferences(preferences, storage);
    expect(loadPreferences(storage)).toEqual(preferences);
    expect(loadPreferences(memoryStorage(JSON.stringify({ ...preferences, cameraView: "free_flight" })))).toEqual({ ...preferences, cameraView: null });
  });
});
