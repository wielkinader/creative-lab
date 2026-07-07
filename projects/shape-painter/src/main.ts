// Step 2 harness: draw a recognisable synthetic target, run the optimiser in a
// worker, and render each committed rectangle with Canvas 2D so we can watch it
// converge. This whole page is temporary scaffolding; the real UI is step 5.

import type { Raster, StartMessage, WorkerOutMessage } from "./types.ts";
import { averageColor, fillRaster } from "./color.ts";
import { drawShape } from "./render2d.ts";

const W = 256;
const H = 170;

/** Draw a simple, clearly recognisable scene (sky, sun, hills, ground). */
function drawScene(ctx: CanvasRenderingContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#2a5a9e");
  sky.addColorStop(1, "#bcd3e8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f4d35e";
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.26, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3a7d44";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72);
  ctx.quadraticCurveTo(W * 0.3, H * 0.5, W * 0.55, H * 0.7);
  ctx.quadraticCurveTo(W * 0.8, H * 0.9, W, H * 0.66);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#26562f";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.85);
  ctx.quadraticCurveTo(W * 0.45, H * 0.72, W, H * 0.88);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
}

function makeCanvas(label: string): { wrap: HTMLElement; canvas: HTMLCanvasElement } {
  const wrap = document.createElement("figure");
  wrap.style.margin = "0";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = "min(46vw, 420px)";
  canvas.style.height = "auto";
  canvas.style.borderRadius = "10px";
  canvas.style.border = "1px solid #262b32";
  canvas.style.imageRendering = "auto";
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  cap.style.cssText = "color:#9aa1ab;font-size:.8rem;margin-top:8px;text-align:center;";
  wrap.append(canvas, cap);
  return { wrap, canvas };
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";
app.style.cssText =
  "min-height:100dvh;background:#0d0f12;color:#e7e9ec;font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;box-sizing:border-box;";

const title = document.createElement("h1");
title.textContent = "Shape Painter — convergence test";
title.style.cssText = "font-size:1.5rem;letter-spacing:-.02em;margin:0 0 4px;";
const sub = document.createElement("p");
sub.textContent = "Step 2: rectangles only, algorithm in a Web Worker.";
sub.style.cssText = "color:#9aa1ab;margin:0 0 24px;font-size:.9rem;";

const row = document.createElement("div");
row.style.cssText = "display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;";
const target = makeCanvas("Target");
const recon = makeCanvas("Reconstruction");
row.append(target.wrap, recon.wrap);

const controls = document.createElement("div");
controls.style.cssText = "margin-top:24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;";
const runBtn = document.createElement("button");
runBtn.textContent = "Run 300 rectangles";
runBtn.style.cssText =
  "background:#6ee7b7;color:#0d0f12;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;font-size:.95rem;";
const status = document.createElement("span");
status.style.cssText = "color:#9aa1ab;font-size:.95rem;font-variant-numeric:tabular-nums;";
controls.append(runBtn, status);

app.append(title, sub, row, controls);

// Draw the target scene and grab its pixels.
const tctx = target.canvas.getContext("2d")!;
drawScene(tctx);
const targetData = tctx.getImageData(0, 0, W, H);
const raster: Raster = { width: W, height: H, data: targetData.data };

const rctx = recon.canvas.getContext("2d")!;

function resetReconstruction(): void {
  const avg = averageColor(raster);
  const filled = fillRaster(W, H, avg);
  const img = rctx.createImageData(W, H);
  img.data.set(filled);
  rctx.putImageData(img, 0, 0);
}
resetReconstruction();

let worker: Worker | null = null;

runBtn.addEventListener("click", () => {
  worker?.terminate();
  resetReconstruction();
  runBtn.disabled = true;
  runBtn.style.opacity = "0.5";

  const started = performance.now();
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
    const msg = e.data;
    if (msg.type === "progress") {
      drawShape(rctx, msg.shape);
      status.textContent = `${msg.count} / ${msg.budget} shapes · ${(msg.similarity * 100).toFixed(1)}% match`;
    } else if (msg.type === "done") {
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      status.textContent = `Done · ${msg.shapes.length} shapes · ${(msg.similarity * 100).toFixed(1)}% match · ${secs}s`;
      runBtn.disabled = false;
      runBtn.style.opacity = "1";
      worker?.terminate();
      worker = null;
    }
  };

  const start: StartMessage = { type: "start", target: raster, budget: 300 };
  worker.postMessage(start);
});
