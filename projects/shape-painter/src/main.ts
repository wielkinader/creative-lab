// Step 4 harness: run the optimiser in a worker, then play the result back as a
// WebGL timelapse with play/pause, speed and a scrubber. Still scaffolding; the
// polished UI is step 5.

import type { Raster, Shape, StartMessage, WorkerOutMessage } from "./types.ts";
import { averageColor } from "./color.ts";
import { WebGLRenderer } from "./webgl.ts";

const W = 256;
const H = 170;
const BASE_SHAPES_PER_SEC = 60;

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
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#26562f";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.85);
  ctx.quadraticCurveTo(W * 0.45, H * 0.72, W, H * 0.88);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
}

// ---- DOM helpers ----

const CANVAS_CSS = "width:min(46vw,420px);height:auto;border-radius:10px;border:1px solid #262b32;display:block;";

function figure(el: HTMLElement, label: string): HTMLElement {
  const wrap = document.createElement("figure");
  wrap.style.margin = "0";
  const cap = document.createElement("figcaption");
  cap.textContent = label;
  cap.style.cssText = "color:#9aa1ab;font-size:.8rem;margin-top:8px;text-align:center;";
  wrap.append(el, cap);
  return wrap;
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText =
    "background:#16191e;color:#e7e9ec;border:1px solid #2c323a;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:.9rem;";
  return b;
}

// ---- Layout ----

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";
app.style.cssText =
  "min-height:100dvh;background:#0d0f12;color:#e7e9ec;font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;box-sizing:border-box;";

const title = document.createElement("h1");
title.textContent = "Shape Painter — WebGL timelapse";
title.style.cssText = "font-size:1.5rem;letter-spacing:-.02em;margin:0 0 4px;";
const sub = document.createElement("p");
sub.textContent = "Step 4: GPU playback with scale/fade-in animation and a scrubber.";
sub.style.cssText = "color:#9aa1ab;margin:0 0 24px;font-size:.9rem;";

const targetCanvas = document.createElement("canvas");
targetCanvas.width = W; targetCanvas.height = H; targetCanvas.style.cssText = CANVAS_CSS;
const glCanvas = document.createElement("canvas");
glCanvas.style.cssText = CANVAS_CSS;

const row = document.createElement("div");
row.style.cssText = "display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;";
row.append(figure(targetCanvas, "Target"), figure(glCanvas, "Reconstruction (WebGL)"));

const runBtn = document.createElement("button");
runBtn.textContent = "Run 300 shapes";
runBtn.style.cssText =
  "background:#6ee7b7;color:#0d0f12;border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;font-size:.95rem;";
const status = document.createElement("span");
status.style.cssText = "color:#9aa1ab;font-size:.95rem;font-variant-numeric:tabular-nums;";
const runRow = document.createElement("div");
runRow.style.cssText = "margin-top:24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;";
runRow.append(runBtn, status);

// Playback controls (hidden until a run finishes).
const playBtn = button("▶ Play");
const speedBtns = [1, 4, 16].map((mult) => {
  const b = button(`${mult}x`);
  b.dataset.speed = String(mult);
  return b;
});
const scrubber = document.createElement("input");
scrubber.type = "range";
scrubber.min = "0"; scrubber.max = "300"; scrubber.step = "0.01"; scrubber.value = "0";
scrubber.style.cssText = "flex:1;min-width:200px;accent-color:#6ee7b7;";
const scrubReadout = document.createElement("span");
scrubReadout.style.cssText = "color:#9aa1ab;font-size:.9rem;font-variant-numeric:tabular-nums;min-width:170px;";
const playbackRow = document.createElement("div");
playbackRow.style.cssText = "margin-top:16px;display:none;gap:12px;align-items:center;flex-wrap:wrap;max-width:900px;";
playbackRow.append(playBtn, ...speedBtns, scrubber, scrubReadout);

app.append(title, sub, row, runRow, playbackRow);

// ---- Target ----

const tctx = targetCanvas.getContext("2d")!;
drawScene(tctx);
const targetData = tctx.getImageData(0, 0, W, H);
const raster: Raster = { width: W, height: H, data: targetData.data };
const bg = averageColor(raster);

// ---- Renderer + playback state ----

const renderer = new WebGLRenderer(glCanvas, W, H);
renderer.setShapes([], bg);
renderer.render(0);

let shapes: Shape[] = [];
let similarities: number[] = [];
let playhead = 0;
let playing = false;
let speed = 4;
let lastFrame = 0;
let worker: Worker | null = null;

function updateSpeedButtons(): void {
  for (const b of speedBtns) {
    const active = Number(b.dataset.speed) === speed;
    b.style.background = active ? "#6ee7b7" : "#16191e";
    b.style.color = active ? "#0d0f12" : "#e7e9ec";
  }
}
updateSpeedButtons();

function setReadout(): void {
  const count = Math.min(shapes.length, Math.floor(playhead));
  const sim = count > 0 ? similarities[count - 1] : 0;
  scrubReadout.textContent = `${count} / ${shapes.length} shapes · ${(sim * 100).toFixed(1)}% match`;
}

function loop(now: number): void {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  if (playing) {
    playhead = Math.min(shapes.length, playhead + BASE_SHAPES_PER_SEC * speed * dt);
    scrubber.value = String(playhead);
    if (playhead >= shapes.length) {
      playing = false;
      playBtn.textContent = "▶ Replay";
    }
  }
  renderer.render(playhead);
  setReadout();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

playBtn.addEventListener("click", () => {
  if (!shapes.length) return;
  if (!playing) {
    if (playhead >= shapes.length) playhead = 0; // replay from start
    playing = true;
    playBtn.textContent = "❚❚ Pause";
  } else {
    playing = false;
    playBtn.textContent = "▶ Play";
  }
});

for (const b of speedBtns) {
  b.addEventListener("click", () => { speed = Number(b.dataset.speed); updateSpeedButtons(); });
}

scrubber.addEventListener("input", () => {
  playing = false;
  playBtn.textContent = "▶ Play";
  playhead = Number(scrubber.value);
});

runBtn.addEventListener("click", () => {
  worker?.terminate();
  runBtn.disabled = true;
  runBtn.style.opacity = "0.5";
  playbackRow.style.display = "none";
  shapes = [];
  similarities = [];
  playhead = 0;
  playing = false;

  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
    const msg = e.data;
    if (msg.type === "progress") {
      shapes.push(msg.shape);
      similarities.push(msg.similarity);
      status.textContent = `Building… ${msg.count} / ${msg.budget} · ${(msg.similarity * 100).toFixed(1)}% match`;
    } else if (msg.type === "done") {
      shapes = msg.shapes;
      renderer.setShapes(shapes, bg);
      scrubber.max = String(shapes.length);
      status.textContent = `Done · ${shapes.length} shapes · ${(msg.similarity * 100).toFixed(1)}% match`;
      runBtn.disabled = false;
      runBtn.style.opacity = "1";
      playbackRow.style.display = "flex";
      playhead = 0;
      playing = true;
      playBtn.textContent = "❚❚ Pause";
      worker?.terminate();
      worker = null;
    }
  };
  const start: StartMessage = { type: "start", target: raster, budget: 300 };
  worker.postMessage(start);
});
