import { createMatchConfig } from "../../src/domain/config";
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
};
const dispose = World.prototype.dispose;
World.prototype.dispose = function () { activeWorlds.delete(this); dispose.call(this); };
const roll = GameAudio.prototype.playRoll;
GameAudio.prototype.playRoll = function () { audio = this; roll.call(this); };

const app = new GameApp();
const root = createRoot(document.querySelector<HTMLDivElement>("#app")!);
root.render(<StrictMode><App app={app} /></StrictMode>);
const output = document.querySelector<HTMLOutputElement>("#stats")!;
const listeners = () => [...tracked.values()].flatMap((events) => [...events.values()]).reduce((total, entries) => total + entries.size, 0);
const baseline = listeners();
document.querySelector("#start")!.addEventListener("click", async () => {
  await app.start(createMatchConfig(1));
  await new Promise<void>((resolve) => {
    const check = () => { if (app.getSnapshot().session?.getSnapshot().attached) resolve(); else requestAnimationFrame(check); };
    check();
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    output.textContent = JSON.stringify({ world: world?.resourceInfo, audioNodes: audio?.activeNodeCount ?? 0, listeners: listeners() - baseline, activeWorlds: activeWorlds.size, revision: app.getSnapshot().session?.getSnapshot().committed.revision });
  }));
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
