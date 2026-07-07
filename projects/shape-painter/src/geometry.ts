import type { Geom, Rgb, Shape, ShapeType, Span } from "./types.ts";
import type { Rng } from "./rng.ts";

function clampInt(v: number, lo: number, hi: number): number {
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Call `cb(y, xa, xb)` once per covered horizontal run, for each integer row
 * the shape touches. Spans are clamped to the canvas, with xa <= xb and
 * 0 <= y < H. All three shape types are convex, so there is at most one run
 * per row. This is the single coverage primitive the scorer and renderer share.
 */
export function forEachSpan(
  geom: Geom,
  W: number,
  H: number,
  cb: (y: number, xa: number, xb: number) => void,
): void {
  if (geom.type === "rectangle") {
    const x0 = clampInt(Math.min(geom.x0, geom.x1), 0, W - 1);
    const x1 = clampInt(Math.max(geom.x0, geom.x1), 0, W - 1);
    const y0 = clampInt(Math.min(geom.y0, geom.y1), 0, H - 1);
    const y1 = clampInt(Math.max(geom.y0, geom.y1), 0, H - 1);
    for (let y = y0; y <= y1; y++) cb(y, x0, x1);
    return;
  }

  if (geom.type === "circle") {
    const { cx, cy, r } = geom;
    if (r <= 0) return;
    const yTop = Math.max(0, Math.ceil(cy - r));
    const yBot = Math.min(H - 1, Math.floor(cy + r));
    for (let y = yTop; y <= yBot; y++) {
      const dy = y - cy;
      const dx2 = r * r - dy * dy;
      if (dx2 < 0) continue;
      const dx = Math.sqrt(dx2);
      const xa = clampInt(cx - dx, 0, W - 1);
      const xb = clampInt(cx + dx, 0, W - 1);
      if (xa > xb) continue;
      cb(y, xa, xb);
    }
    return;
  }

  // Triangle: scanline fill via the standard ray-crossing rule. For each
  // integer row, find where it crosses the three edges (exactly two crossings
  // for rows strictly inside) and fill between the min and max x.
  const xs = [geom.ax, geom.bx, geom.cx];
  const ys = [geom.ay, geom.by, geom.cy];
  const yTop = Math.max(0, Math.ceil(Math.min(ys[0], ys[1], ys[2])));
  const yBot = Math.min(H - 1, Math.floor(Math.max(ys[0], ys[1], ys[2])));
  for (let y = yTop; y <= yBot; y++) {
    let xmin = Infinity;
    let xmax = -Infinity;
    for (let e = 0; e < 3; e++) {
      const j = (e + 1) % 3;
      const y1 = ys[e];
      const y2 = ys[j];
      // Half-open crossing test: counts each spanning edge exactly once.
      if ((y1 > y) === (y2 > y)) continue;
      const t = (y - y1) / (y2 - y1);
      const x = xs[e] + t * (xs[j] - xs[e]);
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
    }
    if (xmax < xmin) continue;
    const xa = clampInt(xmin, 0, W - 1);
    const xb = clampInt(xmax, 0, W - 1);
    if (xa > xb) continue;
    cb(y, xa, xb);
  }
}

/** Collect coverage into an array. Convenience for tests; the hot path uses
 *  forEachSpan directly to avoid allocation. */
export function spans(geom: Geom, W: number, H: number): Span[] {
  const out: Span[] = [];
  forEachSpan(geom, W, H, (y, xa, xb) => out.push({ y, xa, xb }));
  return out;
}

/** Total covered pixel count. */
export function coverageArea(geom: Geom, W: number, H: number): number {
  let n = 0;
  forEachSpan(geom, W, H, (_y, xa, xb) => {
    n += xb - xa + 1;
  });
  return n;
}

// ---- Random generation (size-biased) ----

export function randomGeom(rng: Rng, type: ShapeType, W: number, H: number, maxFrac: number): Geom {
  const maxW = Math.max(2, maxFrac * W);
  const maxH = Math.max(2, maxFrac * H);
  const cx = rng.next() * W;
  const cy = rng.next() * H;

  if (type === "rectangle") {
    const hw = 1 + (rng.next() * maxW) / 2;
    const hh = 1 + (rng.next() * maxH) / 2;
    return {
      type: "rectangle",
      x0: clampInt(cx - hw, 0, W - 1),
      y0: clampInt(cy - hh, 0, H - 1),
      x1: clampInt(cx + hw, 0, W - 1),
      y1: clampInt(cy + hh, 0, H - 1),
    };
  }

  if (type === "circle") {
    const maxR = Math.max(1, (maxFrac * Math.min(W, H)) / 2);
    const r = 1 + rng.next() * maxR;
    return { type: "circle", cx, cy, r };
  }

  // Triangle: three vertices scattered around a centre within the size bias.
  const s = Math.max(2, (maxFrac * Math.min(W, H)) / 2);
  const vx = () => cx + (rng.next() * 2 - 1) * s;
  const vy = () => cy + (rng.next() * 2 - 1) * s;
  return { type: "triangle", ax: vx(), ay: vy(), bx: vx(), by: vy(), cx: vx(), cy: vy() };
}

// ---- Mutation (one property per call) ----

export function mutateGeom(rng: Rng, geom: Geom, W: number, H: number): Geom {
  const m = Math.max(2, Math.round(W * 0.06));
  const d = () => rng.int(-m, m);

  if (geom.type === "rectangle") {
    let { x0, y0, x1, y1 } = geom;
    const pick = rng.int(0, 4);
    if (pick === 0) x0 += d();
    else if (pick === 1) y0 += d();
    else if (pick === 2) x1 += d();
    else if (pick === 3) y1 += d();
    else {
      const dx = d();
      const dy = d();
      x0 += dx; x1 += dx; y0 += dy; y1 += dy;
    }
    return {
      type: "rectangle",
      x0: clampInt(x0, 0, W - 1),
      y0: clampInt(y0, 0, H - 1),
      x1: clampInt(x1, 0, W - 1),
      y1: clampInt(y1, 0, H - 1),
    };
  }

  if (geom.type === "circle") {
    let { cx, cy, r } = geom;
    const pick = rng.int(0, 2);
    if (pick === 0) cx += d();
    else if (pick === 1) cy += d();
    else r = Math.max(1, r + d());
    return {
      type: "circle",
      cx: Math.max(0, Math.min(W - 1, cx)),
      cy: Math.max(0, Math.min(H - 1, cy)),
      r,
    };
  }

  // Triangle: nudge one vertex coordinate, or translate the whole triangle.
  const g = { ...geom };
  const pick = rng.int(0, 6);
  if (pick === 6) {
    const dx = d();
    const dy = d();
    g.ax += dx; g.bx += dx; g.cx += dx;
    g.ay += dy; g.by += dy; g.cy += dy;
  } else {
    const keys: (keyof Omit<typeof g, "type">)[] = ["ax", "ay", "bx", "by", "cx", "cy"];
    const k = keys[pick];
    g[k] += d();
  }
  return g;
}

/** Turn geometry + style into a committed Shape record. */
export function geomToShape(geom: Geom, color: Rgb, alpha: number, index: number): Shape {
  return { ...geom, color, alpha, index } as Shape;
}
