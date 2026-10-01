import { GameApp } from "./app/GameApp";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("应用根节点 #app 不存在");
}

new GameApp(app);
