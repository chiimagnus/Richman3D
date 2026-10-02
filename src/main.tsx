import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameApp } from "./app/GameApp";
import { App } from "./ui/App";
import "./ui/tokens.css";

const container = document.querySelector<HTMLDivElement>("#app");
if (!container) throw new Error("应用根节点 #app 不存在");
const app = new GameApp();
createRoot(container).render(<StrictMode><App app={app} /></StrictMode>);
