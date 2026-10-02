import { afterEach, expect, it, vi } from "vitest";
import { GameAudio } from "../../src/audio/GameAudio";

afterEach(() => vi.unstubAllGlobals());

it("muting stops scheduled notes immediately and disposal closes owned audio", () => {
  const gainParam = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  const gain = { gain: gainParam, connect: vi.fn(), disconnect: vi.fn() };
  const nodes: { stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const close = vi.fn(async () => {});
  vi.stubGlobal("AudioContext", class {
    currentTime = 0;
    state = "running";
    destination = {};
    close = close;
    resume = vi.fn(async () => {});
    createGain() { return gain; }
    createOscillator() {
      const node = { type: "sine", frequency: gainParam, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      nodes.push(node);
      return node;
    }
  });
  const audio = new GameAudio();
  audio.unlock();
  audio.playPurchase();
  expect(audio.activeNodeCount).toBe(3);
  audio.setEnabled(false);
  expect(audio.activeNodeCount).toBe(0);
  for (const node of nodes) {
    expect(node.stop).toHaveBeenCalledTimes(2);
    expect(node.disconnect).toHaveBeenCalledTimes(1);
  }
  expect(gainParam.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
  audio.dispose();
  expect(close).toHaveBeenCalledTimes(1);
  audio.playRoll();
  expect(audio.activeNodeCount).toBe(0);
});
