import * as THREE from "three";
import { MotionClock } from "./MotionClock";

export type MotionFrame = { readonly segmentIndex: number; readonly segmentProgress: number };
type MotionOptions = {
  readonly durationPerSegment?: number;
  readonly onSegment?: (segmentIndex: number) => void;
  readonly signal?: AbortSignal | undefined;
};

export function animatePositions(
  clock: MotionClock,
  points: readonly THREE.Vector3[],
  write: (position: THREE.Vector3, frame: MotionFrame) => void,
  options: MotionOptions = {},
): Promise<boolean> {
  const lastPoint = points.at(-1);
  if (!lastPoint) return Promise.resolve(true);
  const segments = Math.max(points.length - 1, 0);
  const duration = options.durationPerSegment ?? 220;
  const current = new THREE.Vector3();
  let lastSegment = -1;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return clock.animate(segments === 0 || reduced ? 0 : segments * duration, (progress) => {
    const pathProgress = progress * segments;
    const segmentIndex = Math.min(Math.floor(pathProgress), Math.max(segments - 1, 0));
    const linear = progress >= 1 ? 1 : pathProgress - segmentIndex;
    if (!reduced) for (let index = lastSegment + 1; index <= segmentIndex; index += 1) options.onSegment?.(index);
    lastSegment = segmentIndex;
    const from = points[segmentIndex];
    const to = points[segmentIndex + 1];
    if (from && to) current.lerpVectors(from, to, linear * linear * (3 - 2 * linear));
    else current.copy(lastPoint);
    write(current, { segmentIndex, segmentProgress: linear });
  }, options.signal);
}
