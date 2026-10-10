import { afterEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { IDBFactory } from "fake-indexeddb";
import { GameApp } from "../../src/app/GameApp";
import { GameStore } from "../../src/storage/GameStore";
import { App } from "../../src/ui/App";
import { MainMenu } from "../../src/ui/MainMenu";
import { PAGES_ORIGIN } from "../../src/network/endpoints";

const setPanel = vi.hoisted(() => vi.fn());
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useEffect() {}, useRef: () => ({ current: null }),
  useState: () => [null, setPanel],
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
afterEach(() => { setPanel.mockClear(); vi.unstubAllGlobals(); });

it.each([`${PAGES_ORIGIN}/Richman3D/`, "http://192.168.1.20:8787/"])("opens the room panel without navigating away from %s", (href) => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { href, hash: "", assign }, localStorage: { getItem: () => null } });
  vi.stubGlobal("document", { documentElement: {}, addEventListener() {}, removeEventListener() {} });
  const app = new GameApp(new GameStore(() => new IDBFactory()));
  try {
    const element = App({ app }) as ReactElement<{ children: ReactElement<{ onNetwork: () => void }>[] }>;
    const menu = element.props.children.find((child) => child?.type === MainMenu)!;
    menu.props.onNetwork();
    expect(setPanel).toHaveBeenCalledWith("room");
    expect(assign).not.toHaveBeenCalled();
    expect(window.location.href).toBe(href);
  } finally { app.dispose(); }
});
