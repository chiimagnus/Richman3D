import { expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { animatePositions } from "../../src/rendering/motion";
import { MotionClock } from "../../src/rendering/MotionClock";

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
