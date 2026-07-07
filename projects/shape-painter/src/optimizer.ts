import type { Config } from "./config.ts";
import type { Geom, Raster, Rgb, Shape, ShapeType } from "./types.ts";
import { makeRng, type Rng } from "./rng.ts";
import { averageColor, fillRaster } from "./color.ts";
import { commitGeom, evaluateGeom, similarityFromError, totalError } from "./score.ts";
import { geomToShape, mutateGeom, randomGeom } from "./geometry.ts";

const ALL_TYPES: ShapeType[] = ["rectangle", "triangle", "circle"];

/** A candidate shape plus its evaluated colour and score delta. */
interface Candidate {
  geom: Geom;
  color: Rgb;
  delta: number;
}

function evalCandidate(target: Raster, current: Uint8ClampedArray, geom: Geom, alpha: number): Candidate {
  const { color, delta } = evaluateGeom(target, current, geom, alpha);
  return { geom, color, delta };
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
  enabledTypes: ShapeType[] = ALL_TYPES,
): Shape[] {
  const W = target.width;
  const H = target.height;
  const pixelCount = W * H;
  const rng = makeRng(seed);
  const types = enabledTypes.length ? enabledTypes : ALL_TYPES;
  const pickType = (r: Rng): ShapeType => types[r.int(0, types.length - 1)];

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
      const geom = randomGeom(rng, pickType(rng), W, H, maxFrac);
      const cand = evalCandidate(target, current, geom, config.shapeAlpha);
      if (best === null || cand.delta < best.delta) best = cand;
    }
    if (best === null) continue;

    // (d) hill climb: mutate the best candidate, keep improving mutations.
    for (let k = 0; k < config.mutationsPerShape; k++) {
      const geom = mutateGeom(rng, best.geom, W, H);
      const trial = evalCandidate(target, current, geom, config.shapeAlpha);
      if (trial.delta < best.delta) best = trial;
    }

    // A candidate that would make things worse is skipped, not committed.
    if (best.delta >= 0) continue;

    // (e) commit.
    commitGeom(current, W, H, best.geom, best.color, config.shapeAlpha);
    sumErr += best.delta;
    const shape = geomToShape(best.geom, best.color, config.shapeAlpha, shapes.length);
    shapes.push(shape);
    hooks.onShape?.(shape, similarityFromError(sumErr, pixelCount));
  }

  return shapes;
}
