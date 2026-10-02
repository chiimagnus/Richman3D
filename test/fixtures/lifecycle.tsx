import { createMatchConfig, SEAT_COLORS, SEAT_IDS } from "../../src/domain/config";
import type { PlayerId } from "../../src/domain/types";
import type { PlayerView } from "../../src/rendering/PlayerView";
import type { Group } from "three";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameApp } from "../../src/app/GameApp";
import { World } from "../../src/rendering/World";
import { GameAudio } from "../../src/audio/GameAudio";
import { App } from "../../src/ui/App";
import "../../src/ui/tokens.css";

const tracked = new Map<EventTarget, Map<string, Set<EventListenerOrEventListenerObject>>>();
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener = function (type, listener, options) {
  if ((this === window || this === document) && listener) {
    let events = tracked.get(this);
    if (!events) { events = new Map(); tracked.set(this, events); }
    let listeners = events.get(type);
    if (!listeners) { listeners = new Set(); events.set(type, listeners); }
    listeners.add(listener);
  }
  add.call(this, type, listener, options);
};
EventTarget.prototype.removeEventListener = function (type, listener, options) {
  if (listener) tracked.get(this)?.get(type)?.delete(listener);
  remove.call(this, type, listener, options);
};

let world: World | null = null;
let audio: GameAudio | null = null;
const activeWorlds = new Set<World>();
const sync = World.prototype.sync;
World.prototype.sync = function (snapshot) {
  world = this;
  activeWorlds.add(this);
  sync.call(this, snapshot);
  report();
};
const dispose = World.prototype.dispose;
World.prototype.dispose = function () { activeWorlds.delete(this); dispose.call(this); report(); };
const roll = GameAudio.prototype.playRoll;
GameAudio.prototype.playRoll = function () { audio = this; roll.call(this); };

const app = new GameApp();
let holdNextSave = false;
let releaseSave: (() => void) | null = null;
const save = app.store.save.bind(app.store);
app.store.save = async (record, expected) => {
  if (holdNextSave) {
    holdNextSave = false;
    await new Promise<void>((resolve) => { releaseSave = resolve; });
  }
  return save(record, expected);
};
document.addEventListener("keydown", (event) => {
  if (event.code === "F8") { event.preventDefault(); void app.start(createMatchConfig(1)); }
  if (event.code === "F10") { event.preventDefault(); releaseSave?.(); releaseSave = null; }
});
const root = createRoot(document.querySelector<HTMLDivElement>("#app")!);
root.render(<StrictMode><App app={app} /></StrictMode>);
const output = document.querySelector<HTMLOutputElement>("#stats")!;
const listeners = () => [...tracked.values()].flatMap((events) => [...events.values()]).reduce((total, entries) => total + entries.size, 0);
const baseline = listeners();
function report() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const session = app.getSnapshot().session;
    const players: Map<PlayerId, PlayerView> | undefined = world ? Reflect.get(world, "players") : undefined;
    const pawns = players ? [...players].map(([id, pawn]) => {
      const object: Group = Reflect.get(pawn, "object");
      return { id, position: object.position.toArray(), visible: object.visible };
    }) : [];
    output.textContent = JSON.stringify({ world: world?.resourceInfo, pawns, audioNodes: app.audio.activeNodeCount, listeners: listeners() - baseline, activeWorlds: activeWorlds.size, matchId: session?.matchId, revision: session?.getSnapshot().committed.revision, state: session?.getSnapshot().committed, save: session?.getSnapshot().save });
  }));
}
let unwatch = () => {};
app.subscribe(() => { unwatch(); unwatch = app.getSnapshot().session?.subscribe(report) ?? (() => {}); report(); });
document.querySelector("#hold-save")!.addEventListener("click", () => { holdNextSave = true; });
document.querySelector("#release-save")!.addEventListener("click", () => { releaseSave?.(); releaseSave = null; });
document.querySelector("#start")!.addEventListener("click", async () => {
  const size = Number(document.querySelector<HTMLSelectElement>("#seats")!.value);
  const human = Number(document.querySelector<HTMLSelectElement>("#human")!.value);
  const config = createMatchConfig(341);
  await app.start({ ...config, seed: size === 2 && human === 0 ? 1 : 341, players: SEAT_IDS.slice(0, size).map((id, index) => ({
    id, defaultNameKey: id, controller: index === human ? "human" : "bot", name: null, color: SEAT_COLORS[index]!,
  })) });
  await new Promise<void>((resolve) => {
    const check = () => { if (app.getSnapshot().session?.getSnapshot().attached) resolve(); else requestAnimationFrame(check); };
    check();
  });
  report();
});
document.querySelector("#dispose")!.addEventListener("click", () => {
  app.leave();
  requestAnimationFrame(() => {
    output.textContent = JSON.stringify({ world: world?.resourceInfo, audioNodes: audio?.activeNodeCount ?? 0, listeners: listeners() - baseline, activeWorlds: activeWorlds.size });
  });
});

document.querySelector("#unmount")!.addEventListener("click", () => {
  root.render(null);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const session = app.getSnapshot().session;
    output.textContent = JSON.stringify({ matchId: session?.matchId, state: session?.getSnapshot().committed, activeWorlds: activeWorlds.size });
  }));
});
document.querySelector("#bind")!.addEventListener("click", () => {
  root.render(<StrictMode><App app={app} /></StrictMode>);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const session = app.getSnapshot().session;
    output.textContent = JSON.stringify({ matchId: session?.matchId, state: session?.getSnapshot().committed, activeWorlds: activeWorlds.size });
  }));
});
