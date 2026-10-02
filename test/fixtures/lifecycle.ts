import { GameApp } from "../../src/app/GameApp";
import "../../src/style.css";

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

let app: GameApp | null = null;
const root = document.querySelector<HTMLDivElement>("#app")!;
const output = document.querySelector<HTMLOutputElement>("#stats")!;
const listeners = () => [...tracked.values()].flatMap((events) => [...events.values()]).reduce((total, entries) => total + entries.size, 0);

document.querySelector("#start")!.addEventListener("click", () => {
  app?.dispose();
  app = new GameApp(root);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (app) output.textContent = JSON.stringify({ ...app.resourceInfo, listeners: listeners() });
  }));
});
document.querySelector("#dispose")!.addEventListener("click", () => {
  app?.dispose();
  output.textContent = JSON.stringify({ ...app?.resourceInfo, listeners: listeners() });
  app = null;
});
