import type { Raster, Rgb } from "./types.ts";
import { clamp255 } from "./color.ts";

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
 * For an axis-aligned rectangle covering [x0..x1] x [y0..y1] (inclusive),
 * compute (1) the colour that minimises error when drawn at the given alpha
 * over the current canvas, and (2) the resulting change in total squared
 * error. Only the covered pixels are touched, so this is O(area), not O(image).
 *
 * Derivation of the optimal colour: drawing colour c at alpha a over
 * background bg gives a*c + (1-a)*bg. Minimising sum (a*c + (1-a)*bg - t)^2
 * over the covered pixels gives, per channel, c = mean((t - (1-a)*bg) / a).
 */
export function evaluateRect(
  target: Raster,
  current: Uint8ClampedArray,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  alpha: number,
): { color: Rgb; delta: number } {
  const W = target.width;
  const t = target.data;
  const inv = 1 - alpha;

  // Pass 1: accumulate the optimal colour.
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    let idx = (y * W + x0) * 4;
    for (let x = x0; x <= x1; x++) {
      sr += (t[idx] - inv * current[idx]) / alpha;
      sg += (t[idx + 1] - inv * current[idx + 1]) / alpha;
      sb += (t[idx + 2] - inv * current[idx + 2]) / alpha;
      count++;
      idx += 4;
    }
  }
  const color: Rgb = {
    r: clamp255(Math.round(sr / count)),
    g: clamp255(Math.round(sg / count)),
    b: clamp255(Math.round(sb / count)),
  };

  // Pass 2: exact change in squared error if we draw this colour.
  let delta = 0;
  for (let y = y0; y <= y1; y++) {
    let idx = (y * W + x0) * 4;
    for (let x = x0; x <= x1; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const bg = current[idx + ch];
        const tv = t[idx + ch];
        const nc = alpha * (ch === 0 ? color.r : ch === 1 ? color.g : color.b) + inv * bg;
        const oldDiff = bg - tv;
        const newDiff = nc - tv;
        delta += newDiff * newDiff - oldDiff * oldDiff;
      }
      idx += 4;
    }
  }

  return { color, delta };
}

/** Paint an axis-aligned rectangle permanently onto the current canvas. */
export function commitRect(
  current: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  alpha: number,
): void {
  const inv = 1 - alpha;
  for (let y = y0; y <= y1; y++) {
    let idx = (y * width + x0) * 4;
    for (let x = x0; x <= x1; x++) {
      current[idx] = alpha * color.r + inv * current[idx];
      current[idx + 1] = alpha * color.g + inv * current[idx + 1];
      current[idx + 2] = alpha * color.b + inv * current[idx + 2];
      idx += 4;
    }
  }
}
