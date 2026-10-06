import { afterEach, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { animatePositions } from "../../src/rendering/motion";
import { MotionClock } from "../../src/rendering/MotionClock";

afterEach(() => vi.unstubAllGlobals());

it("scales every shared clock job once and keeps cancellation and final progress unchanged", async () => {
  const clock = new MotionClock();
  const write = vi.fn();
  clock.setPlaybackRate(2);
  const finished = clock.animate(800, write);
  clock.update(300); expect(write).toHaveBeenLastCalledWith(0.75);
  clock.update(100); expect(await finished).toBe(true); expect(write).toHaveBeenLastCalledWith(1);
  clock.setPlaybackRate(1);
  const normal = clock.animate(800, write);
  clock.update(400); expect(write).toHaveBeenLastCalledWith(0.5);
  clock.cancel(); expect(await normal).toBe(false); expect(clock.activeCount).toBe(0);
});

it("reduced motion reaches the real final position without bursting every skipped footstep", async () => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  const clock = new MotionClock(); const position = new Vector3(); const onSegment = vi.fn();
  expect(await animatePositions(clock, [new Vector3(), new Vector3(2, 0, 0), new Vector3(4, 0, 0)], value => position.copy(value), { onSegment })).toBe(true);
  expect(position.toArray()).toEqual([4, 0, 0]); expect(onSegment).not.toHaveBeenCalled(); expect(clock.activeCount).toBe(0);
});

it("uses controlled delta, finishes at the last point and removes its job", async () => {
  const clock = new MotionClock();
  const position = new Vector3();
  const onSegment = vi.fn();
  const promise = animatePositions(clock, [new Vector3(), new Vector3(2, 0, 0), new Vector3(4, 0, 0)], (value) => position.copy(value), { durationPerSegment: 100, onSegment });
  clock.update(50);
  expect(position.x).toBe(1);
  clock.update(150);
  expect(await promise).toBe(true);
  expect(position.x).toBe(4);
  expect(clock.activeCount).toBe(0);
  expect(onSegment).toHaveBeenCalledTimes(2);
});

it.each(["abort", "cancel", "finish"])("%s settles motion without its own timer or animation loop", async (action) => {
  const clock = new MotionClock();
  const controller = new AbortController();
  const write = vi.fn();
  const promise = animatePositions(clock, [new Vector3(), new Vector3(4, 0, 0)], write, { signal: controller.signal });
  if (action === "abort") controller.abort();
  else if (action === "cancel") clock.cancel();
  else clock.finish();
  expect(await promise).toBe(action === "finish");
  expect(clock.activeCount).toBe(0);
  const calls = write.mock.calls.length;
  clock.update(1000);
  expect(write).toHaveBeenCalledTimes(calls);
});

it("settles a failing writer and removes the job and abort listener", async () => {
  const clock = new MotionClock();
  const promise = clock.animate(100, () => { throw new Error("write failed"); });
  const rejection = expect(promise).rejects.toThrow("write failed");
  clock.update(50);
  await rejection;
  expect(clock.activeCount).toBe(0);
});
