import type { Raster, Rgb } from "./types.ts";

const MAX_SOURCE = 1600; // cap full-res source for memory/export sanity

export interface LoadedImage {
  /** Full-resolution source (capped) for display, compare and export. */
  source: HTMLCanvasElement;
  fullWidth: number;
  fullHeight: number;
  /** Downscaled raster the algorithm scores against. */
  raster: Raster;
  /** Accent colour sampled from the image. */
  accent: Rgb;
}

function drawScaled(img: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c;
}

/** Fit `longest` px on the longer side, preserving aspect ratio. */
function fitSize(w: number, h: number, longest: number): { w: number; h: number } {
  const scale = Math.min(1, longest / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export function processImage(img: CanvasImageSource, srcW: number, srcH: number, scoringRes: number): LoadedImage {
  const full = fitSize(srcW, srcH, MAX_SOURCE);
  const source = drawScaled(img, full.w, full.h);

  const score = fitSize(srcW, srcH, scoringRes);
  const scoreCanvas = drawScaled(img, score.w, score.h);
  const data = scoreCanvas.getContext("2d")!.getImageData(0, 0, score.w, score.h).data;
  const raster: Raster = { width: score.w, height: score.h, data };

  return { source, fullWidth: full.w, fullHeight: full.h, raster, accent: pickAccent(raster) };
}

/**
 * Choose a lively accent from the image: scan pixels, keep the most saturated
 * one that isn't too dark or too washed out. Falls back to the average colour.
 */
export function pickAccent(raster: Raster): Rgb {
  const { data } = raster;
  let best: Rgb | null = null;
  let bestScore = -1;
  let ar = 0, ag = 0, ab = 0, n = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    ar += r; ag += g; ab += b; n++;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = max / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (light < 0.25 || light > 0.92) continue; // skip near-black / near-white
    const score = sat * (1 - Math.abs(light - 0.55)); // prefer mid-light, saturated
    if (score > bestScore) {
      bestScore = score;
      best = { r, g, b };
    }
  }

  if (best && bestScore > 0.08) return liven(best);
  return { r: Math.round(ar / n), g: Math.round(ag / n), b: Math.round(ab / n) };
}

/** Nudge a colour toward a usable UI accent: cap darkness, keep it punchy. */
function liven(c: Rgb): Rgb {
  const max = Math.max(c.r, c.g, c.b);
  if (max < 140) {
    const k = 140 / Math.max(1, max);
    return { r: Math.min(255, Math.round(c.r * k)), g: Math.min(255, Math.round(c.g * k)), b: Math.min(255, Math.round(c.b * k)) };
  }
  return c;
}

export function loadFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
}
