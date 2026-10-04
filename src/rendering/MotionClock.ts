type Job = { update(delta: number): void; cancel(): void; finish(): void };

export class MotionClock {
  private readonly jobs = new Set<Job>();
  private playbackRate: 1 | 2 = 1;

  setPlaybackRate(rate: 1 | 2): void { this.playbackRate = rate; }

  animate(duration: number, write: (progress: number) => void, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false);
    if (duration <= 0) {
      write(1);
      return Promise.resolve(true);
    }
    return new Promise((resolve, reject) => {
      let elapsed = 0;
      const remove = () => {
        this.jobs.delete(job);
        signal?.removeEventListener("abort", job.cancel);
      };
      const job: Job = {
        update: (delta) => {
          elapsed = Math.min(elapsed + delta, duration);
          try {
            write(elapsed / duration);
            if (elapsed >= duration) { remove(); resolve(true); }
          } catch (error) { remove(); reject(error); }
        },
        cancel: () => { remove(); resolve(false); },
        finish: () => {
          try { write(1); remove(); resolve(true); }
          catch (error) { remove(); reject(error); }
        },
      };
      this.jobs.add(job);
      signal?.addEventListener("abort", job.cancel, { once: true });
    });
  }

  update(delta: number): void {
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError("帧间隔无效");
    for (const job of [...this.jobs]) job.update(delta * this.playbackRate);
  }

  cancel(): void { for (const job of [...this.jobs]) job.cancel(); }
  finish(): void { for (const job of [...this.jobs]) job.finish(); }
  get activeCount(): number { return this.jobs.size; }
}
