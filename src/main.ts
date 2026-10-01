import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("应用根节点 #app 不存在");
}

app.innerHTML = `
  <main class="boot-screen">
    <p class="eyebrow">Richman 3D</p>
    <h1>第一人称大富翁</h1>
    <p>游戏世界正在初始化。</p>
  </main>
`;
