import { test } from "node:test";
import assert from "node:assert/strict";

import type { Geom, Raster } from "../src/types.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { averageColor, fillRaster } from "../src/color.ts";
import { evaluateGeom, similarityFromError, totalError } from "../src/score.ts";
import { coverageArea, spans } from "../src/geometry.ts";
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

// ---- Scanline coverage on known cases ----

test("rectangle spans cover the exact inclusive bounds", () => {
  const g: Geom = { type: "rectangle", x0: 2, y0: 1, x1: 5, y1: 3 };
  const s = spans(g, 10, 10);
  assert.equal(s.length, 3); // rows 1,2,3
  for (const row of s) {
    assert.equal(row.xa, 2);
    assert.equal(row.xb, 5);
  }
  assert.equal(coverageArea(g, 10, 10), 3 * 4); // 3 rows x 4 cols
});

test("rectangle spans clamp to the canvas edges", () => {
  const g: Geom = { type: "rectangle", x0: -5, y0: -5, x1: 3, y1: 3 };
  const s = spans(g, 8, 8);
  assert.equal(s[0].y, 0);
  assert.equal(s[0].xa, 0);
  assert.equal(s[0].xb, 3);
});

test("circle coverage approximates pi * r^2", () => {
  const r = 30;
  const g: Geom = { type: "circle", cx: 50, cy: 50, r };
  const area = coverageArea(g, 100, 100);
  const expected = Math.PI * r * r;
  // Discrete rasterisation, so allow a few percent slack.
  assert.ok(Math.abs(area - expected) / expected < 0.05, `area ${area} vs ~${expected.toFixed(0)}`);
});

test("circle spans are symmetric about the centre row", () => {
  const g: Geom = { type: "circle", cx: 20, cy: 20, r: 10 };
  const byRow = new Map<number, { xa: number; xb: number }>();
  for (const row of spans(g, 40, 40)) byRow.set(row.y, { xa: row.xa, xb: row.xb });

  // Centre row spans the full diameter.
  assert.deepEqual(byRow.get(20), { xa: 10, xb: 30 });
  // Rows equidistant above and below the centre have identical widths.
  for (let d = 1; d <= 9; d++) {
    const above = byRow.get(20 - d)!;
    const below = byRow.get(20 + d)!;
    assert.equal(above.xb - above.xa, below.xb - below.xa, `width mismatch at ±${d}`);
  }
});

test("right triangle coverage approximates half its bounding box", () => {
  // Vertices (0,0),(40,0),(0,40): a right triangle of area 800.
  const g: Geom = { type: "triangle", ax: 0, ay: 0, bx: 40, by: 0, cx: 0, cy: 40 };
  const area = coverageArea(g, 50, 50);
  assert.ok(Math.abs(area - 800) / 800 < 0.08, `area ${area} vs ~800`);
});

test("triangle spans narrow toward the apex", () => {
  // Isosceles triangle apex at top (10,0), base along y=20.
  const g: Geom = { type: "triangle", ax: 10, ay: 0, bx: 0, by: 20, cx: 20, cy: 20 };
  const s = spans(g, 30, 30).sort((a, b) => a.y - b.y);
  const topWidth = s[0].xb - s[0].xa;
  const bottomWidth = s[s.length - 1].xb - s[s.length - 1].xa;
  assert.ok(bottomWidth > topWidth, `bottom ${bottomWidth} should be wider than top ${topWidth}`);
});

// ---- Scoring ----

test("evaluateGeom finds a colour that reduces error on a solid target", () => {
  const target = syntheticTarget(32, 32);
  const current = fillRaster(32, 32, averageColor(target));
  const g: Geom = { type: "rectangle", x0: 0, y0: 0, x1: 15, y1: 31 };
  const { color, delta } = evaluateGeom(target, current, g, 0.6);
  assert.ok(delta < 0, `expected error to drop, got delta=${delta}`);
  assert.ok(color.r > color.b, `expected a reddish colour, got ${JSON.stringify(color)}`);
});

// ---- Convergence ----

test("optimizer converges: 200 shapes (all types) beat the baseline", () => {
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
  assert.ok(last > 0.85, `final similarity ${last.toFixed(3)} should exceed 0.85`);
});

test("triangles-only run converges (low-poly path)", () => {
  const target = syntheticTarget();
  let last = 0;
  runOptimizer(target, 150, DEFAULT_CONFIG, { onShape: (_s, sim) => { last = sim; } }, 7, ["triangle"]);
  assert.ok(last > 0.8, `triangles-only final ${last.toFixed(3)} should exceed 0.8`);
});

test("optimizer is deterministic for a fixed seed", () => {
  const target = syntheticTarget(48, 48);
  const a = runOptimizer(target, 40, DEFAULT_CONFIG, {}, 42);
  const b = runOptimizer(target, 40, DEFAULT_CONFIG, {}, 42);
  assert.deepEqual(a, b);
});
