import type { Geom, Raster, Rgb } from "./types.ts";
import { clamp255 } from "./color.ts";
import { forEachSpan } from "./geometry.ts";

/** Sum of squared RGB error between two rasters of equal size. */
export function totalError(current: Uint8ClampedArray, target: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < current.length; i += 4) {
    const dr = current[i] - target[i];
    const dg = current[i + 1] - target[i + 1];
    const db = current[i + 2] - target[i + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  return sum;
}

/**
 * Map a sum-of-squared-error total to a friendly similarity in [0,1].
 * RMSE per channel is at most 255 (black vs white everywhere).
 */
export function similarityFromError(sumErr: number, pixelCount: number): number {
  const rmse = Math.sqrt(sumErr / (pixelCount * 3));
  return Math.max(0, 1 - rmse / 255);
}

/**
 * For any convex shape, compute (1) the colour that minimises error when drawn
 * at the given alpha over the current canvas, and (2) the resulting change in
 * total squared error. Only covered pixels are touched, so this is O(area).
 *
 * Optimal colour: drawing colour c at alpha a over background bg gives
 * a*c + (1-a)*bg. Minimising sum (a*c + (1-a)*bg - t)^2 over covered pixels
 * gives, per channel, c = mean((t - (1-a)*bg) / a).
 */
export function evaluateGeom(
  target: Raster,
  current: Uint8ClampedArray,
  geom: Geom,
  alpha: number,
): { color: Rgb; delta: number; area: number } {
  const W = target.width;
  const H = target.height;
  const t = target.data;
  const inv = 1 - alpha;

  // Pass 1: accumulate the optimal colour.
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let count = 0;
  forEachSpan(geom, W, H, (y, xa, xb) => {
    let idx = (y * W + xa) * 4;
    for (let x = xa; x <= xb; x++) {
      sr += (t[idx] - inv * current[idx]) / alpha;
      sg += (t[idx + 1] - inv * current[idx + 1]) / alpha;
      sb += (t[idx + 2] - inv * current[idx + 2]) / alpha;
      count++;
      idx += 4;
    }
  });

  if (count === 0) return { color: { r: 0, g: 0, b: 0 }, delta: 0, area: 0 };

  const cr = clamp255(Math.round(sr / count));
  const cg = clamp255(Math.round(sg / count));
  const cb = clamp255(Math.round(sb / count));

  // Pass 2: exact change in squared error if we draw this colour.
  let delta = 0;
  forEachSpan(geom, W, H, (y, xa, xb) => {
    let idx = (y * W + xa) * 4;
    for (let x = xa; x <= xb; x++) {
      const nr = alpha * cr + inv * current[idx] - t[idx];
      const ng = alpha * cg + inv * current[idx + 1] - t[idx + 1];
      const nb = alpha * cb + inv * current[idx + 2] - t[idx + 2];
      const or_ = current[idx] - t[idx];
      const og = current[idx + 1] - t[idx + 1];
      const ob = current[idx + 2] - t[idx + 2];
      delta += nr * nr - or_ * or_ + ng * ng - og * og + nb * nb - ob * ob;
      idx += 4;
    }
  });

  return { color: { r: cr, g: cg, b: cb }, delta, area: count };
}

/** Paint a shape permanently onto the current canvas. */
export function commitGeom(
  current: Uint8ClampedArray,
  W: number,
  H: number,
  geom: Geom,
  color: Rgb,
  alpha: number,
): void {
  const inv = 1 - alpha;
  forEachSpan(geom, W, H, (y, xa, xb) => {
    let idx = (y * W + xa) * 4;
    for (let x = xa; x <= xb; x++) {
      current[idx] = alpha * color.r + inv * current[idx];
      current[idx + 1] = alpha * color.g + inv * current[idx + 1];
      current[idx + 2] = alpha * color.b + inv * current[idx + 2];
      idx += 4;
    }
  });
}
