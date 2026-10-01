import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  lookSensitivityScale,
  savePreferences,
} from "./preferences";

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

describe("game preferences", () => {
  it("uses defaults when nothing is stored", () => {
    const storage = memoryStorage();

    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it("loads valid persisted preferences", () => {
    const storage = memoryStorage(
      JSON.stringify({
        soundEnabled: false,
        lookSensitivity: "high",
      }),
    );

    expect(loadPreferences(storage)).toEqual({
      soundEnabled: false,
      lookSensitivity: "high",
    });
  });

  it("falls back per field when stored data is invalid", () => {
    const storage = memoryStorage(
      JSON.stringify({
        soundEnabled: "yes",
        lookSensitivity: "turbo",
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
      },
      storage,
    );

    expect(JSON.parse(storage.read() ?? "null")).toEqual({
      soundEnabled: false,
      lookSensitivity: "low",
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
});
