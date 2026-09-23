interface Semver {
  readonly core: readonly [number, number, number];
  readonly pre: readonly string[];
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parse(version: string): Semver | null {
  const m = SEMVER.exec(version.trim());
  if (m === null) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] === undefined ? [] : m[4].split('.'),
  };
}

function compareIdentifier(a: string, b: string): number {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Math.sign(Number(a) - Number(b));
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const order = compareIdentifier(a[i]!, b[i]!);
    if (order !== 0) return order;
  }
  return Math.sign(a.length - b.length);
}

/** -1, 0 or 1 by semver precedence; null when either side is not `x.y.z`. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const left = parse(a);
  const right = parse(b);
  if (left === null || right === null) return null;
  for (let i = 0; i < 3; i += 1) {
    const diff = left.core[i]! - right.core[i]!;
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  const pre = comparePrerelease(left.pre, right.pre);
  return pre < 0 ? -1 : pre > 0 ? 1 : 0;
}
