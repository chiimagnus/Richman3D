import { createMatchConfig } from "../src/domain/config";
import { describe, expect, it } from "vitest";

import { CITY } from "../src/domain/maps/city";
import {
  chanceCardText,
  formatMessage,
  messages,
  playerName,
  tileName,
} from "../src/i18n";
import en from "../src/i18n/locales/en.json";
import zhCN from "../src/i18n/locales/zh-CN.json";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
    .map((match) => match[1] ?? "")
    .sort();
}

function stringEntries(
  value: unknown,
  prefix = "",
): readonly (readonly [path: string, value: string])[] {
  if (typeof value === "string") {
    return [[prefix, value]];
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    stringEntries(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n", () => {
  it("keeps locale JSON files structurally identical", () => {
    expect(leafPaths(en).sort()).toEqual(leafPaths(zhCN).sort());
  });

  it("keeps placeholders identical across locales", () => {
    const zhEntries = new Map(stringEntries(zhCN));

    for (const [path, text] of stringEntries(en)) {
      expect(placeholders(text), path).toEqual(
        placeholders(zhEntries.get(path) ?? ""),
      );
    }
  });

  it("has localized names for every board tile", () => {
    for (const tile of CITY.tiles) {
      expect(tileName("zh-CN", tile).length).toBeGreaterThan(0);
      expect(tileName("en", tile).length).toBeGreaterThan(0);
    }
  });

  it("loads Chinese and English locale data", () => {
    expect(playerName("zh-CN", "p1", createMatchConfig())).toBe("你");
    expect(messages("zh-CN").settings.title).toBe("设置");
    expect(playerName("en", "p2", createMatchConfig())).toBe("City Player");
    expect(chanceCardText("en", "innovation-bonus", 120)).toBe(
      "City innovation bonus +120",
    );
  });

  it("formats JSON message templates", () => {
    expect(
      formatMessage(messages("en").status.purchased, {
        actor: "You", propertyName: "Harbor Walk",
      }),
    ).toBe("You bought “Harbor Walk”.");
  });
});
