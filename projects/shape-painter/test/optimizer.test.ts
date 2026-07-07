import { test } from "node:test";
import assert from "node:assert/strict";

import type { Raster } from "../src/types.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { averageColor, fillRaster } from "../src/color.ts";
import { evaluateRect, similarityFromError, totalError } from "../src/score.ts";
import { runOptimizer } from "../src/optimizer.ts";

/** Build a small synthetic target: red left, blue right, green centre square. */
function syntheticTarget(W = 64, H = 64): Raster {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = x < W / 2 ? 200 : 20;
      let g = 30;
      let b = x < W / 2 ? 30 : 200;
      const inCentre = x > W * 0.35 && x < W * 0.65 && y > H * 0.35 && y < H * 0.65;
      if (inCentre) { r = 30; g = 200; b = 40; }
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

test("averageColor returns the mean of a uniform raster", () => {
  const data = fillRaster(4, 4, { r: 100, g: 150, b: 200 });
  const avg = averageColor({ width: 4, height: 4, data });
  assert.deepEqual(avg, { r: 100, g: 150, b: 200 });
});

test("evaluateRect finds a colour that reduces error on a solid target", () => {
  const target = syntheticTarget(32, 32);
  const current = fillRaster(32, 32, averageColor(target));
  // A rectangle over the (red) left half should have a negative delta.
  const { color, delta } = evaluateRect(target, current, 0, 0, 15, 31, 0.6);
  assert.ok(delta < 0, `expected error to drop, got delta=${delta}`);
  assert.ok(color.r > color.b, `expected a reddish colour, got ${JSON.stringify(color)}`);
});

test("optimizer converges: 200 rectangles beat the average-colour baseline", () => {
  const target = syntheticTarget();
  const pixels = target.width * target.height;

  const baseline = similarityFromError(
    totalError(fillRaster(target.width, target.height, averageColor(target)), target.data),
    pixels,
  );

  let last = 0;
  const shapes = runOptimizer(target, 200, DEFAULT_CONFIG, {
    onShape: (_s, similarity) => { last = similarity; },
  });

  assert.ok(shapes.length > 0, "should commit at least one shape");
  assert.ok(last > baseline + 0.1, `final ${last.toFixed(3)} should beat baseline ${baseline.toFixed(3)} by >0.1`);
  assert.ok(last > 0.85, `final similarity ${last.toFixed(3)} should exceed 0.85 on a simple image`);
});

test("optimizer is deterministic for a fixed seed", () => {
  const target = syntheticTarget(48, 48);
  const a = runOptimizer(target, 40, DEFAULT_CONFIG, {}, 42);
  const b = runOptimizer(target, 40, DEFAULT_CONFIG, {}, 42);
  assert.deepEqual(a, b);
});
