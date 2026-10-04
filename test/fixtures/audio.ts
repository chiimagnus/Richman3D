import { vi } from "vitest";

export function audioProtocol(initialState = "running") {
  const contexts: TestContext[] = [];
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(function (this: { value: number }, value: number) { this.value = value; }), exponentialRampToValueAtTime: vi.fn() });
  const gainNode = () => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() });
  const oscillatorNode = () => ({ type: "sine", frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null });
  class TestContext extends EventTarget {
    currentTime = 0;
    state = initialState;
    destination = {};
    gains: ReturnType<typeof gainNode>[] = [];
    oscillators: ReturnType<typeof oscillatorNode>[] = [];
    resume = vi.fn(async () => { this.state = "running"; this.dispatchEvent(new Event("statechange")); });
    close = vi.fn(async () => { this.state = "closed"; });
    constructor() { super(); contexts.push(this); }
    createGain() { const node = gainNode(); this.gains.push(node); return node; }
    createOscillator() { const node = oscillatorNode(); this.oscillators.push(node); return node; }
  }
  vi.stubGlobal("AudioContext", TestContext);
  return contexts;
}
