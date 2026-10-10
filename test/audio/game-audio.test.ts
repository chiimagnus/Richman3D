import { afterEach, expect, it, vi } from "vitest";
import { GameAudio } from "../../src/audio/GameAudio";
import { audioProtocol } from "../fixtures/audio";
import { playSeatFeedback } from "../../src/ui/SceneHost";
import { GameSession } from "../../src/app/GameSession";
import { Game } from "../../src/domain/game";
import { createMatchConfig } from "../../src/domain/config";
import { builtRentDebtMatch } from "../fixtures/debt-match";

it.each(["human", "bot"] as const)("preserves %s p2 feedback for real local sessions", (controller) => {
  const config = createMatchConfig();
  const session = new GameSession(new Game({ ...config, players: config.players.map((player, index) => ({ ...player, controller: index === 1 ? controller : player.controller })) }));
  const game = builtRentDebtMatch(2);
  for (const propertyId of ["neon-avenue", "harbor-walk"]) expect(game.apply({ kind: "sell_building", propertyId, actor: "p1", expectedRevision: game.snapshot.revision }).ok).toBe(true);
  const result = game.apply({ kind: "bankrupt", actor: "p1", expectedRevision: game.snapshot.revision });
  if (!result.ok) throw new Error("Expected terminal command");
  const ended = result.events.find((event) => event.kind === "ended");
  if (!ended || ended.kind !== "ended") throw new Error("Expected terminal event");
  const contexts = audioProtocol(); const audio = new GameAudio(); audio.unlock();
  try {
    playSeatFeedback(audio, session.getSnapshot(), { kind: "turn", actor: "p2" });
    expect(contexts[0]!.oscillators.map((node) => node.frequency.value)).toEqual(controller === "human" ? [440, 660] : [300, 240]);
    const offset = contexts[0]!.oscillators.length;
    audio.stop(); playSeatFeedback(audio, session.getSnapshot(), ended);
    expect(contexts[0]!.oscillators.slice(offset).map((node) => node.frequency.value)).toEqual(controller === "human" ? [440, 554, 659, 880] : [330, 247, 196]);
  } finally { audio.dispose(); session.dispose(); }
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("creates one context only on unlock and routes independent music/effect mixes through the existing master", () => {
  const contexts = audioProtocol(); const audio = new GameAudio();
  audio.setPlaying(true); audio.playPurchase(); audio.setVolumes(0.5, 0.2);
  expect(contexts).toHaveLength(0); expect(audio.activeNodeCount).toBe(0);
  audio.unlock(); const context = contexts[0]!;
  expect(audio.getSnapshot()).toBe("ready"); expect(context.gains).toHaveLength(3);
  const [master, effects, music] = context.gains;
  expect(effects!.gain.value).toBe(0.5); expect(music!.gain.value).toBeCloseTo(0.2 * 0.035);
  expect(effects!.connect).toHaveBeenCalledWith(master); expect(music!.connect).toHaveBeenCalledWith(master);
  expect(master!.connect).toHaveBeenCalledWith(context.destination);
  expect(audio.activeNodeCount).toBe(3);
  for (const oscillator of context.oscillators) expect(oscillator.connect).toHaveBeenCalledWith(music);
  audio.playPurchase(); expect(audio.activeNodeCount).toBe(6);
  for (const gain of context.gains.slice(3)) expect(gain.connect).toHaveBeenCalledWith(effects);
  audio.stop(); expect(audio.activeNodeCount).toBe(3);
  audio.setPlaying(false); expect(audio.activeNodeCount).toBe(0);
  audio.setPlaying(true); expect(audio.activeNodeCount).toBe(3); expect(contexts).toHaveLength(1);
  audio.dispose(); audio.dispose(); expect(context.close).toHaveBeenCalledTimes(1);
  for (const gain of context.gains) expect(gain.disconnect).toHaveBeenCalledTimes(1);
  for (const oscillator of context.oscillators) expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
});

it("total mute immediately silences the master and releases both scheduled action notes and ambient sources", () => {
  const contexts = audioProtocol(); const audio = new GameAudio(); audio.unlock(); audio.setPlaying(true); audio.playRoll();
  expect(audio.activeNodeCount).toBe(7); audio.setEnabled(false);
  expect(audio.activeNodeCount).toBe(0); expect(contexts[0]!.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
  for (const oscillator of contexts[0]!.oscillators) expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
  audio.playPurchase(); audio.setPlaying(true); expect(audio.activeNodeCount).toBe(0);
  audio.dispose(); expect(contexts[0]!.close).toHaveBeenCalledTimes(1);
});

it("volume zero stays silent across future effects, unmute, and new matches without creating a second context", () => {
  const contexts = audioProtocol(); const audio = new GameAudio(true, 0, 0); audio.unlock(); audio.setPlaying(true);
  audio.playRoll(); audio.playPurchase(); expect(audio.activeNodeCount).toBe(0); expect(contexts[0]!.oscillators).toHaveLength(0);
  audio.setEnabled(false); audio.setPlaying(false); audio.setEnabled(true); audio.setPlaying(true);
  expect(audio.activeNodeCount).toBe(0); expect(contexts).toHaveLength(1);
  audio.setVolumes(0, 0.25); expect(audio.activeNodeCount).toBe(3); audio.playPurchase(); expect(audio.activeNodeCount).toBe(3);
  audio.setVolumes(0, 0); expect(audio.activeNodeCount).toBe(0); audio.setPlaying(false); audio.setPlaying(true);
  expect(audio.activeNodeCount).toBe(0); expect(contexts[0]!.gains[1]!.gain.value).toBe(0); expect(contexts[0]!.gains[2]!.gain.value).toBe(0);
  audio.dispose();
});

it.each(["reject", "throw"] as const)("resume %s is visible, queues no stale notes and retries only on an explicit unlock", async failure => {
  const contexts = audioProtocol("suspended"); const audio = new GameAudio(); const changed = vi.fn(); audio.subscribe(changed);
  audio.unlock(); await Promise.resolve(); const context = contexts[0]!;
  context.state = "suspended"; context.dispatchEvent(new Event("statechange"));
  context.resume.mockImplementationOnce(() => { if (failure === "throw") throw new Error("Denied"); return Promise.reject(new Error("Denied")); });
  audio.unlock(); await Promise.resolve(); expect(audio.getSnapshot()).toBe("blocked");
  const calls = context.resume.mock.calls.length;
  for (let index = 0; index < 5; index += 1) { audio.setPlaying(true); audio.playRoll(); audio.setVolumes(1, 0.12); }
  expect(context.resume).toHaveBeenCalledTimes(calls); expect(context.oscillators).toHaveLength(0);
  audio.unlock(); await Promise.resolve(); expect(audio.getSnapshot()).toBe("ready"); expect(audio.activeNodeCount).toBe(3);
  expect(contexts).toHaveLength(1); expect(changed).toHaveBeenCalled(); audio.dispose();
});

it("late permission completion after disposal cannot start music or notify a removed view", async () => {
  const contexts = audioProtocol("suspended"); const audio = new GameAudio(); audio.unlock(); await Promise.resolve();
  const context = contexts[0]!; context.state = "suspended";
  let finish = () => {};
  context.resume.mockImplementationOnce(() => new Promise<void>(resolve => { finish = () => { context.state = "running"; resolve(); }; }));
  const changed = vi.fn(); audio.subscribe(changed); audio.setPlaying(true); audio.unlock(); audio.dispose(); finish(); await Promise.resolve();
  expect(changed).not.toHaveBeenCalled(); expect(audio.activeNodeCount).toBe(0); expect(context.oscillators).toHaveLength(0);
  audio.unlock(); expect(contexts).toHaveLength(1); expect(context.close).toHaveBeenCalledTimes(1);
});

it("native context interruption cancels old sources before a future resume and retains independent volume", () => {
  const contexts = audioProtocol(); const audio = new GameAudio(true, 0.4, 0.2); audio.unlock(); audio.setPlaying(true); audio.playPurchase();
  const context = contexts[0]!; const old = [...context.oscillators]; context.state = "suspended"; context.dispatchEvent(new Event("statechange"));
  expect(audio.activeNodeCount).toBe(0); expect(audio.getSnapshot()).toBe("locked");
  context.state = "running"; context.dispatchEvent(new Event("statechange")); expect(audio.activeNodeCount).toBe(3);
  for (const oscillator of old) expect(oscillator.disconnect).toHaveBeenCalledTimes(1);
  expect(context.gains[1]!.gain.value).toBe(0.4); expect(context.gains[2]!.gain.value).toBeCloseTo(0.2 * 0.035);
  audio.dispose();
});

it("audio allocation failures stay inside audio and release partial resources instead of failing a game command", () => {
  const contexts = audioProtocol(); const audio = new GameAudio(); audio.unlock(); const context = contexts[0]!;
  vi.spyOn(context, "createGain").mockImplementationOnce(() => { throw new Error("allocation"); });
  expect(() => audio.playPurchase()).not.toThrow(); expect(audio.getSnapshot()).toBe("blocked"); expect(audio.activeNodeCount).toBe(0);
  expect(context.oscillators[0]!.disconnect).toHaveBeenCalledTimes(1);
  audio.dispose();
});

it("unavailable Web Audio offers a blocked status without creating a context implicitly", () => {
  vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Unavailable"); } });
  const audio = new GameAudio(); audio.unlock(); expect(audio.getSnapshot()).toBe("blocked");
  expect(() => { audio.playRoll(); audio.setPlaying(true); audio.dispose(); }).not.toThrow();
});

it("partial ambient allocation releases already started sources and recovers only after explicit unlock", () => {
  const contexts = audioProtocol(); const audio = new GameAudio(); audio.unlock(); const context = contexts[0]!;
  const createOscillator = context.createOscillator.bind(context);
  vi.spyOn(context, "createOscillator").mockImplementationOnce(createOscillator).mockImplementationOnce(() => { throw new Error("allocation"); });
  expect(() => audio.setPlaying(true)).not.toThrow();
  expect(audio.getSnapshot()).toBe("blocked"); expect(audio.activeNodeCount).toBe(0);
  expect(context.oscillators[0]!.stop).toHaveBeenCalledTimes(1);
  expect(context.oscillators[0]!.disconnect).toHaveBeenCalledTimes(1);
  audio.setPlaying(true); expect(context.oscillators).toHaveLength(1);
  audio.unlock(); expect(audio.activeNodeCount).toBe(3); expect(contexts).toHaveLength(1);
  audio.dispose();
});

it("failed mixer initialization closes the partial context and allows a clean explicit retry", () => {
  const contexts = audioProtocol();
  const createGain = AudioContext.prototype.createGain;
  vi.spyOn(AudioContext.prototype, "createGain").mockImplementationOnce(createGain).mockImplementationOnce(() => { throw new Error("allocation"); });
  const audio = new GameAudio(); audio.setPlaying(true);
  expect(() => audio.unlock()).not.toThrow(); expect(audio.getSnapshot()).toBe("blocked");
  expect(contexts[0]!.close).toHaveBeenCalledTimes(1); expect(contexts[0]!.oscillators).toHaveLength(0);
  audio.unlock(); expect(contexts).toHaveLength(2); expect(audio.getSnapshot()).toBe("ready"); expect(audio.activeNodeCount).toBe(3);
  audio.dispose(); expect(contexts[0]!.close).toHaveBeenCalledTimes(1); expect(contexts[1]!.close).toHaveBeenCalledTimes(1);
});
