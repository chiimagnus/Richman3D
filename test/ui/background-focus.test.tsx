import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Hud } from "../../src/ui/Hud";
import { Game } from "../../src/domain/game";
import { GameSession } from "../../src/app/GameSession";

const effects = vi.hoisted(() => [] as (() => void)[]);
const focus = vi.hoisted(() => vi.fn());
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useEffect: (effect: () => void) => { effects.push(effect); },
  useRef: () => ({ current: { querySelector: () => ({ focus }) } }),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
afterEach(() => { effects.length = 0; focus.mockClear(); vi.unstubAllGlobals(); });

it.each([true, false])("focuses the decision only when the page is visible (hidden=%s)", (hidden) => {
  const body = {};
  vi.stubGlobal("document", { hidden, body, activeElement: body });
  const session = new GameSession(new Game(), "focus");
  renderToStaticMarkup(<Hud session={session} language="en" onAssets={() => {}} assetPanel={null} inspectedTileId={null} onInspect={() => {}} />);
  effects.forEach((effect) => effect());
  expect(focus).toHaveBeenCalledTimes(hidden ? 0 : 1);
  session.dispose();
});
