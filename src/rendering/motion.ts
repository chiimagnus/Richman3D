import * as THREE from "three";

export type MotionFrame = {
  readonly segmentIndex: number;
  readonly segmentProgress: number;
};

type PositionWriter = (position: THREE.Vector3, frame: MotionFrame) => void;

type MotionOptions = {
  readonly durationPerSegment?: number;
  readonly onSegment?: (segmentIndex: number) => void;
};

export function animatePositions(
  points: readonly THREE.Vector3[],
  write: PositionWriter,
  options: MotionOptions = {},
): Promise<void> {
  const firstPoint = points[0];
  const lastPoint = points.at(-1);

  if (!firstPoint || !lastPoint) {
    return Promise.resolve();
  }

  const segmentCount = Math.max(points.length - 1, 0);
  const durationPerSegment = options.durationPerSegment ?? 220;

  if (
    segmentCount === 0 ||
    prefersReducedMotion() ||
    durationPerSegment <= 0
  ) {
    write(lastPoint, {
      segmentIndex: Math.max(segmentCount - 1, 0),
      segmentProgress: 1,
    });
    return Promise.resolve();
  }

  const totalDuration = segmentCount * durationPerSegment;

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const current = new THREE.Vector3();
    let finished = false;
    let lastSegment = -1;

    const finish = (): void => {
      if (finished) {
        return;
      }

      finished = true;
      write(lastPoint, {
        segmentIndex: segmentCount - 1,
        segmentProgress: 1,
      });
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

      if (segmentIndex !== lastSegment) {
        lastSegment = segmentIndex;
        options.onSegment?.(segmentIndex);
      }

      const linearProgress =
        elapsed >= totalDuration ? 1 : pathProgress - segmentIndex;
      const eased =
        linearProgress * linearProgress * (3 - 2 * linearProgress);

      current.lerpVectors(from, to, eased);
      write(current, {
        segmentIndex,
        segmentProgress: linearProgress,
      });

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
