import type { RandomState } from "./types";

const DOMAIN_SIZE = 0xffff_ffff;
const ZERO_SEED = 0x6d2b79f5;

export class RuleRandom {
  private state: number;
  private draws: number;
  private readonly inputSeed: number;

  constructor(seed: number | RandomState) {
    if (typeof seed === "number") {
      if (!Number.isInteger(seed) || seed < 0 || seed > DOMAIN_SIZE) throw new RangeError("种子必须为 uint32");
      this.inputSeed = seed;
      this.state = seed || ZERO_SEED;
      this.draws = 0;
    } else {
      if (seed.version !== "xorshift32-v1" ||
          !Number.isInteger(seed.inputSeed) || seed.inputSeed < 0 || seed.inputSeed > DOMAIN_SIZE ||
          !Number.isInteger(seed.state) || seed.state <= 0 || seed.state > DOMAIN_SIZE ||
          !Number.isSafeInteger(seed.draws) || seed.draws < 0) throw new RangeError("随机状态无效");
      this.inputSeed = seed.inputSeed;
      this.state = seed.state;
      this.draws = seed.draws;
    }
  }

  get snapshot(): RandomState {
    return { version: "xorshift32-v1", inputSeed: this.inputSeed, state: this.state, draws: this.draws };
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    this.draws += 1;
    return this.state;
  }

  integer(bound: number): number {
    if (!Number.isInteger(bound) || bound < 1 || bound > DOMAIN_SIZE) throw new RangeError("随机上界无效");
    const limit = DOMAIN_SIZE - DOMAIN_SIZE % bound;
    let value: number;
    do { value = this.next() - 1; } while (value >= limit);
    return value % bound;
  }
}
