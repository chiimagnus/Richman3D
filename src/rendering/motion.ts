import * as THREE from "three";

type PositionWriter = (position: THREE.Vector3) => void;

export function animatePositions(
  points: readonly THREE.Vector3[],
  write: PositionWriter,
  durationPerSegment = 220,
): Promise<void> {
  const firstPoint = points[0];
  const lastPoint = points.at(-1);

  if (!firstPoint || !lastPoint) {
    return Promise.resolve();
  }

  if (points.length === 1 || prefersReducedMotion() || durationPerSegment <= 0) {
    write(lastPoint);
    return Promise.resolve();
  }

  const segmentCount = points.length - 1;
  const totalDuration = segmentCount * durationPerSegment;

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const current = new THREE.Vector3();
    let finished = false;

    const finish = (): void => {
      if (finished) {
        return;
      }

      finished = true;
      write(lastPoint);
      resolve();
    };

    const fallbackTimer = window.setTimeout(finish, totalDuration + 120);

    const frame = (now: number): void => {
      if (finished) {
        return;
      }

      const elapsed = Math.min(now - startedAt, totalDuration);
      const pathProgress = elapsed / durationPerSegment;
      const segmentIndex = Math.min(
        Math.floor(pathProgress),
        segmentCount - 1,
      );
      const from = points[segmentIndex];
      const to = points[segmentIndex + 1];

      if (!from || !to) {
        window.clearTimeout(fallbackTimer);
        finish();
        return;
      }

      const linearProgress =
        elapsed >= totalDuration ? 1 : pathProgress - segmentIndex;
      const eased =
        linearProgress * linearProgress * (3 - 2 * linearProgress);

      current.lerpVectors(from, to, eased);
      write(current);

      if (elapsed < totalDuration) {
        requestAnimationFrame(frame);
      } else {
        window.clearTimeout(fallbackTimer);
        finish();
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
