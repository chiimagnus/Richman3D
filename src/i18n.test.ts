import { describe, expect, it } from "vitest";

import { BOARD } from "./domain/board";
import { chanceCardText, messages, playerName, tileName } from "./i18n";

describe("i18n", () => {
  it("translates every board tile into English", () => {
    for (const tile of BOARD) {
      expect(tileName("en", tile)).not.toBe(tile.name);
      expect(tileName("en", tile).length).toBeGreaterThan(0);
    }
  });

  it("keeps Chinese as the default content language", () => {
    expect(playerName("zh-CN", "human")).toBe("你");
    expect(messages("zh-CN").settings.title).toBe("设置");
  });

  it("translates player and chance-card copy into English", () => {
    expect(playerName("en", "bot")).toBe("City Player");
    expect(chanceCardText("en", "innovation-bonus")).toBe(
      "City innovation bonus +120",
    );
  });
});
