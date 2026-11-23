// Measurement math: calibrate against a reference of known size, then convert
// distances in the photo (pixels) into real-world millimetres.

export type Pt = { x: number; y: number };
export type Line = { a: Pt; b: Pt };

export type RefSpec =
  | { kind: 'rect'; w: number; h: number } // mm
  | { kind: 'line'; len: number } // mm
  | { kind: 'invalid'; needs: 'rect' | 'line' };

export type Calibration =
  | { kind: 'homography'; h: number[] }
  | { kind: 'scale'; mmPerPx: number };

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// Solve Ax = b (n×n) by Gaussian elimination with partial pivoting.
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) return null;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

// Homography mapping src[i] -> dst[i] for 4 point pairs.
export function homography(src: Pt[], dst: Pt[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return h ? [...h, 1] : null;
}

export function applyH(h: number[], p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

// Order 4 points around their centroid so they form a proper quad,
// whatever order the corners were tapped in.
export function orderQuad(pts: Pt[]): Pt[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
}

export function pointsNeeded(spec: RefSpec): number {
  const kind = spec.kind === 'invalid' ? spec.needs : spec.kind;
  return kind === 'rect' ? 4 : 2;
}

export function calibrate(spec: RefSpec, refPts: Pt[]): Calibration | null {
  if (spec.kind === 'line' && refPts.length === 2) {
    const d = dist(refPts[0], refPts[1]);
    return d > 0 ? { kind: 'scale', mmPerPx: spec.len / d } : null;
  }
  if (spec.kind === 'rect' && refPts.length === 4) {
    const q = orderQuad(refPts);
    // Match the longer pair of opposite edges in the photo to the longer real side.
    const e01 = dist(q[0], q[1]) + dist(q[2], q[3]);
    const e12 = dist(q[1], q[2]) + dist(q[3], q[0]);
    const long = Math.max(spec.w, spec.h);
    const short = Math.min(spec.w, spec.h);
    const [a, b] = e01 >= e12 ? [long, short] : [short, long];
    const h = homography(q, [
      { x: 0, y: 0 },
      { x: a, y: 0 },
      { x: a, y: b },
      { x: 0, y: b },
    ]);
    return h ? { kind: 'homography', h } : null;
  }
  return null;
}

export function measureMM(cal: Calibration, a: Pt, b: Pt): number {
  return cal.kind === 'homography'
    ? dist(applyH(cal.h, a), applyH(cal.h, b))
    : dist(a, b) * cal.mmPerPx;
}

export const UNITS = { mm: 1, cm: 10, in: 25.4, m: 1000 } as const;
export type Unit = keyof typeof UNITS;

export function format(mm: number, unit: Unit): string {
  const v = mm / UNITS[unit];
  const digits = unit === 'mm' ? (v < 20 ? 1 : 0) : unit === 'm' ? 3 : 1;
  return `${v.toFixed(digits)} ${unit}`;
}
