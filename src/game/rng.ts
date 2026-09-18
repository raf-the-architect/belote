/* ============================================================================
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * Le serveur peut rejouer une manche à l'identique à partir de la graine.
 * ==========================================================================*/

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** entier dans [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export function makeSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
