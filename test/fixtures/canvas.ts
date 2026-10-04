import { vi } from "vitest";

export function stubCanvas(fillText = vi.fn()) {
  const canvases: { width: number; height: number; draws: { text: string; font: string; width: number; arguments: unknown[] }[] }[] = [];
  vi.stubGlobal("document", { createElement: () => {
    const canvas = { width: 0, height: 0, draws: [] as { text: string; font: string; width: number; arguments: unknown[] }[] };
    const context = {
      font: "10px sans-serif", clearRect() {}, beginPath() {}, roundRect() {}, closePath() {}, fill() {}, fillRect() {},
      measureText(text: string) {
        const size = Number(/(\d+)px/.exec(this.font)![1]);
        return { width: Array.from(text).reduce((width, character) => width + size * (character.codePointAt(0)! <= 127 ? 0.55 : 1), 0) };
      },
      fillText(...arguments_: [string, number, number, number?]) {
        canvas.draws.push({ text: arguments_[0], font: this.font, width: this.measureText(arguments_[0]).width, arguments: arguments_ });
        fillText(...arguments_);
      },
    };
    canvases.push(canvas);
    return Object.assign(canvas, { getContext: () => context });
  } });
  return canvases;
}
