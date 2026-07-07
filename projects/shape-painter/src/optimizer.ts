import type { Config } from "./config.ts";
import type { Raster, Rgb, Shape } from "./types.ts";
import { makeRng, type Rng } from "./rng.ts";
import { averageColor, fillRaster } from "./color.ts";
import { commitRect, evaluateRect, similarityFromError, totalError } from "./score.ts";

/** A candidate rectangle plus its evaluated colour and score delta. */
interface Candidate {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: Rgb;
  delta: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}

/** Random axis-aligned rectangle whose size is capped by the current bias. */
function randomRect(rng: Rng, W: number, H: number, maxFrac: number): { x0: number; y0: number; x1: number; y1: number } {
  const maxHalfW = Math.max(1, (maxFrac * W) / 2);
  const maxHalfH = Math.max(1, (maxFrac * H) / 2);
  const cx = rng.next() * W;
  const cy = rng.next() * H;
  const hw = 1 + rng.next() * maxHalfW;
  const hh = 1 + rng.next() * maxHalfH;
  const x0 = clampInt(cx - hw, 0, W - 1);
  const x1 = clampInt(cx + hw, 0, W - 1);
  const y0 = clampInt(cy - hh, 0, H - 1);
  const y1 = clampInt(cy + hh, 0, H - 1);
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
}

function evalCandidate(
  target: Raster,
  current: Uint8ClampedArray,
  r: { x0: number; y0: number; x1: number; y1: number },
  alpha: number,
): Candidate {
  const { color, delta } = evaluateRect(target, current, r.x0, r.y0, r.x1, r.y1, alpha);
  return { ...r, color, delta };
}

/** Nudge one edge or the whole box, keeping the rectangle valid. */
function mutate(rng: Rng, c: Candidate, W: number, H: number): { x0: number; y0: number; x1: number; y1: number } {
  const m = Math.max(2, Math.round(W * 0.06));
  let { x0, y0, x1, y1 } = c;
  const pick = rng.int(0, 4);
  const d = rng.int(-m, m);
  if (pick === 0) x0 += d;
  else if (pick === 1) y0 += d;
  else if (pick === 2) x1 += d;
  else if (pick === 3) y1 += d;
  else {
    // translate whole box
    const dx = rng.int(-m, m);
    const dy = rng.int(-m, m);
    x0 += dx; x1 += dx; y0 += dy; y1 += dy;
  }
  x0 = clampInt(x0, 0, W - 1);
  x1 = clampInt(x1, 0, W - 1);
  y0 = clampInt(y0, 0, H - 1);
  y1 = clampInt(y1, 0, H - 1);
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
}

export interface OptimizerHooks {
  /** Called after each shape is committed. */
  onShape?: (shape: Shape, similarity: number) => void;
  /** Return true to stop early (e.g. user cancelled). */
  shouldStop?: () => boolean;
}

/**
 * Run the hill-climbing shape approximation. Pure except for the callbacks:
 * given a target raster and a budget it returns the ordered shape list.
 */
export function runOptimizer(
  target: Raster,
  budget: number,
  config: Config,
  hooks: OptimizerHooks = {},
  seed = 1,
): Shape[] {
  const W = target.width;
  const H = target.height;
  const pixelCount = W * H;
  const rng = makeRng(seed);

  const current = fillRaster(W, H, averageColor(target));
  let sumErr = totalError(current, target.data);

  const shapes: Shape[] = [];

  for (let i = 0; i < budget; i++) {
    if (hooks.shouldStop?.()) break;

    // Size bias: big shapes first for broad colour blocks, small ones later
    // for detail.
    const t = budget > 1 ? i / (budget - 1) : 0;
    const maxFrac = config.sizeBiasStart + (config.sizeBiasEnd - config.sizeBiasStart) * t;

    // (a) random candidates, (b) each scored with its optimal colour.
    let best: Candidate | null = null;
    for (let k = 0; k < config.candidatesPerShape; k++) {
      const cand = evalCandidate(target, current, randomRect(rng, W, H, maxFrac), config.shapeAlpha);
      if (best === null || cand.delta < best.delta) best = cand;
    }
    if (best === null) continue;

    // (d) hill climb: mutate the best candidate, keep improving mutations.
    for (let k = 0; k < config.mutationsPerShape; k++) {
      const trial = evalCandidate(target, current, mutate(rng, best, W, H), config.shapeAlpha);
      if (trial.delta < best.delta) best = trial;
    }

    // A candidate that would make things worse is skipped, not committed.
    if (best.delta >= 0) continue;

    // (e) commit.
    commitRect(current, W, best.x0, best.y0, best.x1, best.y1, best.color, config.shapeAlpha);
    sumErr += best.delta;
    const shape: Shape = {
      type: "rectangle",
      x0: best.x0,
      y0: best.y0,
      x1: best.x1,
      y1: best.y1,
      color: best.color,
      alpha: config.shapeAlpha,
      index: shapes.length,
    };
    shapes.push(shape);
    hooks.onShape?.(shape, similarityFromError(sumErr, pixelCount));
  }

  return shapes;
}
