import * as THREE from "three";

type PositionWriter = (position: THREE.Vector3) => void;

export async function animatePositions(
  points: readonly THREE.Vector3[],
  write: PositionWriter,
  durationPerSegment = 220,
): Promise<void> {
  if (points.length === 0) {
    return;
  }

  if (prefersReducedMotion() || durationPerSegment <= 0) {
    const lastPoint = points.at(-1);
    if (lastPoint) {
      write(lastPoint);
    }
    return;
  }

  for (let index = 0; index < points.length; index += 1) {
    const target = points[index];
    if (!target) {
      continue;
    }

    const previous = index === 0 ? undefined : points[index - 1];
    if (!previous) {
      write(target);
      continue;
    }

    await animateSegment(previous, target, write, durationPerSegment);
  }
}

function animateSegment(
  from: THREE.Vector3,
  to: THREE.Vector3,
  write: PositionWriter,
  duration: number,
): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const current = new THREE.Vector3();

    const frame = (now: number): void => {
      const rawProgress = Math.min((now - startedAt) / duration, 1);
      const eased = rawProgress * rawProgress * (3 - 2 * rawProgress);
      current.lerpVectors(from, to, eased);
      write(current);

      if (rawProgress < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
