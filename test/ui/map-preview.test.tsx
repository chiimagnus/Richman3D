import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPreview } from "../../src/ui/MapPreview";
import { MAPS } from "../../src/domain/maps";
import { QUICK_RULES } from "../../src/domain/rules";
import { messages, tileName } from "../../src/i18n";

it.each(["zh-CN", "en"] as const)("%s preview presents the registered path and complete accessible prices without changing it", (language) => {
  for (const map of MAPS) {
    const before = JSON.stringify(map);
    const html = renderToStaticMarkup(<MapPreview map={map} rules={QUICK_RULES} language={language} />);
    expect(html).toContain(messages(language).maps.prices);
    expect(html.match(/<rect\b/g)).toHaveLength(map.path.length);
    expect(html.match(/<li\b/g)).toHaveLength(map.tiles.length);
    for (const tile of map.tiles) expect(html).toContain(tileName(language, tile));
    expect(html).not.toContain("<button");
    expect(JSON.stringify(map)).toBe(before);
  }
});
