import "./style.css";
import type { LoadedImage } from "./image.ts";
import type { Rgb, Shape, ShapeType, StartMessage, WorkerOutMessage } from "./types.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { loadFile, processImage } from "./image.ts";
import { SAMPLES } from "./samples.ts";
import { WebGLRenderer } from "./webgl.ts";
import { exportPng, exportSvg } from "./exporters.ts";

const SCORING_RES = DEFAULT_CONFIG.scoringResolution;
const BASE_SHAPES_PER_SEC = 60;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="app">
  <div class="stage">
    <div class="viewer" id="viewer" hidden>
      <canvas id="gl"></canvas>
      <div class="compare-overlay" id="compareOverlay"></div>
      <span class="compare-tag left">Original</span>
      <span class="compare-tag right">Shapes</span>
      <div class="compare-handle" id="compareHandle"></div>
    </div>
    <div class="stage-empty" id="stageEmpty">Pick a sample or drop a photo to begin</div>
  </div>

  <aside class="panel">
    <div class="brand">
      <h1><span class="dot"></span>Shape&nbsp;Painter</h1>
      <p>Photos rebuilt from overlapping shapes</p>
    </div>

    <div class="group">
      <p class="group-label">Source</p>
      <div class="samples" id="samples"></div>
      <div class="drop" id="drop"><b>Upload</b> or drop a photo here</div>
      <input type="file" id="file" accept="image/*" hidden />
    </div>

    <div class="group">
      <p class="group-label">Parameters</p>
      <div class="row"><span class="lbl">Shape budget</span><span class="val" id="budgetVal">300</span></div>
      <input type="range" id="budget" min="50" max="1000" step="10" value="300" />
      <div class="row" style="margin:16px 0 8px"><span class="lbl">Shape types</span></div>
      <div class="seg" id="types">
        <button data-type="circle" aria-pressed="true">Circle</button>
        <button data-type="triangle" aria-pressed="true">Triangle</button>
        <button data-type="rectangle" aria-pressed="true">Rect</button>
      </div>
      <p class="hint">Keep at least one on. Triangles alone give a low-poly look.</p>
      <details>
        <summary style="cursor:pointer;color:var(--muted);font-size:.78rem;">Advanced</summary>
        <div class="row" style="margin-top:12px"><span class="lbl">Shape opacity</span><span class="val" id="alphaVal">0.60</span></div>
        <input type="range" id="alpha" min="0.3" max="0.9" step="0.05" value="0.6" />
      </details>
    </div>

    <div class="group">
      <button class="btn btn-accent" id="run" disabled>Paint</button>
      <div class="progress" id="progress" hidden>
        <div class="bar"><span id="barFill"></span></div>
        <div class="read" id="progressRead"><b>0</b> / 300 shapes</div>
      </div>
    </div>

    <div class="group" id="playbackGroup" hidden>
      <p class="group-label">Timelapse</p>
      <div class="playback">
        <button class="icon-btn" id="playBtn" title="Play / pause">▶</button>
        <input type="range" id="scrub" min="0" max="300" step="0.01" value="0" />
      </div>
      <div class="row">
        <div class="speed" id="speed">
          <button data-speed="1">1×</button>
          <button data-speed="4" aria-pressed="true">4×</button>
          <button data-speed="16">16×</button>
        </div>
        <span class="val" id="playRead">0 / 300</span>
      </div>
      <button class="btn btn-toggle" id="compareBtn" aria-pressed="false" style="margin-top:14px">Compare with original</button>
    </div>

    <div class="group" id="exportGroup" hidden>
      <p class="group-label">Export</p>
      <div class="split">
        <button class="btn" id="pngBtn">PNG</button>
        <button class="btn" id="svgBtn">SVG</button>
      </div>
    </div>
  </aside>
</div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const viewer = $("viewer");
const glCanvas = $<HTMLCanvasElement>("gl");
const compareOverlay = $("compareOverlay");
const compareHandle = $("compareHandle");
const stageEmpty = $("stageEmpty");
const samplesEl = $("samples");
const drop = $("drop");
const fileInput = $<HTMLInputElement>("file");
const budget = $<HTMLInputElement>("budget");
const budgetVal = $("budgetVal");
const typesEl = $("types");
const alpha = $<HTMLInputElement>("alpha");
const alphaVal = $("alphaVal");
const runBtn = $<HTMLButtonElement>("run");
const progress = $("progress");
const barFill = $("barFill");
const progressRead = $("progressRead");
const playbackGroup = $("playbackGroup");
const playBtn = $("playBtn");
const scrub = $<HTMLInputElement>("scrub");
const speedEl = $("speed");
const playRead = $("playRead");
const compareBtn = $("compareBtn");
const exportGroup = $("exportGroup");
const pngBtn = $("pngBtn");
const svgBtn = $("svgBtn");

// ---- State ----
let image: LoadedImage | null = null;
let renderer: WebGLRenderer | null = null;
let shapes: Shape[] = [];
let similarities: number[] = [];
let bg: Rgb = { r: 20, g: 24, b: 30 };
let playhead = 0;
let playing = false;
let speed = 4;
let lastFrame = 0;
let worker: Worker | null = null;
let building = false;
const enabled = new Set<ShapeType>(["circle", "triangle", "rectangle"]);

// ---- Accent ----
function luminance(c: Rgb): number { return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }
function mixWhite(c: Rgb, t: number): Rgb {
  return { r: Math.round(c.r + (255 - c.r) * t), g: Math.round(c.g + (255 - c.g) * t), b: Math.round(c.b + (255 - c.b) * t) };
}
function applyAccent(c: Rgb): void {
  const s = document.documentElement.style;
  const strong = mixWhite(c, 0.22);
  s.setProperty("--accent", `rgb(${c.r},${c.g},${c.b})`);
  s.setProperty("--accent-strong", `rgb(${strong.r},${strong.g},${strong.b})`);
  s.setProperty("--accent-ink", luminance(c) > 150 ? "#06110c" : "#f6f8fb");
}

// ---- Samples ----
for (const sample of SAMPLES) {
  const el = document.createElement("button");
  el.className = "sample";
  el.title = sample.name;
  const c = sample.make();
  el.style.backgroundImage = `url(${c.toDataURL()})`;
  el.addEventListener("click", () => loadSource(c, c.width, c.height));
  samplesEl.append(el);
}

// ---- Load ----
function loadSource(img: CanvasImageSource, w: number, h: number): void {
  cancelBuild();
  image = processImage(img, w, h, SCORING_RES);
  bg = { r: 0, g: 0, b: 0 };
  const avg = image.raster;
  // background = average colour of the image (the algorithm's starting canvas)
  let ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < avg.data.length; i += 4) { ar += avg.data[i]; ag += avg.data[i + 1]; ab += avg.data[i + 2]; }
  const n = avg.data.length / 4;
  bg = { r: Math.round(ar / n), g: Math.round(ag / n), b: Math.round(ab / n) };

  applyAccent(image.accent);
  compareOverlay.style.backgroundImage = `url(${image.source.toDataURL()})`;

  if (!renderer) renderer = new WebGLRenderer(glCanvas, image.raster.width, image.raster.height);
  else renderer.resize(image.raster.width, image.raster.height);
  renderer.setShapes([], bg);
  renderer.render(0);

  shapes = [];
  similarities = [];
  playhead = 0;
  playing = false;
  viewer.hidden = false;
  stageEmpty.hidden = true;
  playbackGroup.hidden = true;
  exportGroup.hidden = true;
  progress.hidden = true;
  viewer.classList.remove("compare-on");
  compareBtn.setAttribute("aria-pressed", "false");
  runBtn.disabled = false;
}

// ---- File / drag-drop ----
fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (f) { const img = await loadFile(f); loadSource(img, img.naturalWidth, img.naturalHeight); }
});
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", async (e) => {
  e.preventDefault();
  drop.classList.remove("drag");
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith("image/")) { const img = await loadFile(f); loadSource(img, img.naturalWidth, img.naturalHeight); }
});

// ---- Parameters ----
budget.addEventListener("input", () => { budgetVal.textContent = budget.value; });
alpha.addEventListener("input", () => { alphaVal.textContent = Number(alpha.value).toFixed(2); });
typesEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
  b.addEventListener("click", () => {
    const t = b.dataset.type as ShapeType;
    const on = b.getAttribute("aria-pressed") === "true";
    if (on && enabled.size === 1) return; // keep at least one
    if (on) { enabled.delete(t); b.setAttribute("aria-pressed", "false"); }
    else { enabled.add(t); b.setAttribute("aria-pressed", "true"); }
  });
});

// ---- Run / Cancel ----
function setRunning(on: boolean): void {
  building = on;
  runBtn.textContent = on ? "Cancel" : "Paint";
  runBtn.classList.toggle("btn-accent", !on);
  runBtn.classList.toggle("btn-danger", on);
}
function cancelBuild(): void {
  worker?.terminate();
  worker = null;
  if (building) setRunning(false);
}

runBtn.addEventListener("click", () => {
  if (!image) return;
  if (building) { finalize(shapes, similarities.at(-1) ?? 0); cancelBuild(); return; }

  shapes = [];
  similarities = [];
  playhead = 0;
  playing = false;
  playbackGroup.hidden = true;
  exportGroup.hidden = true;
  viewer.classList.remove("compare-on");
  compareBtn.setAttribute("aria-pressed", "false");
  progress.hidden = false;
  const budgetN = Number(budget.value);
  barFill.style.width = "0%";
  progressRead.innerHTML = `<b>0</b> / ${budgetN} shapes`;
  renderer!.setShapes([], bg);
  setRunning(true);

  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
    const msg = e.data;
    if (msg.type === "progress") {
      shapes.push(msg.shape);
      similarities.push(msg.similarity);
      barFill.style.width = `${(msg.count / msg.budget) * 100}%`;
      progressRead.innerHTML = `<b>${msg.count}</b> / ${msg.budget} shapes · ${(msg.similarity * 100).toFixed(1)}%`;
    } else if (msg.type === "done") {
      finalize(msg.shapes, msg.similarity);
      cancelBuild();
    }
  };
  const start: StartMessage = {
    type: "start",
    target: image.raster,
    budget: budgetN,
    enabledTypes: [...enabled],
    alpha: Number(alpha.value),
  };
  worker.postMessage(start);
});

function finalize(finalShapes: Shape[], similarity: number): void {
  if (!renderer || !finalShapes.length) { progress.hidden = true; return; }
  shapes = finalShapes;
  renderer.setShapes(shapes, bg);
  scrub.max = String(shapes.length);
  progress.hidden = true;
  playbackGroup.hidden = false;
  exportGroup.hidden = false;
  playRead.textContent = `${shapes.length} / ${shapes.length} · ${(similarity * 100).toFixed(1)}%`;
  playhead = 0;
  playing = true;
  playBtn.textContent = "❚❚";
}

// ---- Playback loop ----
function setPlayRead(): void {
  const count = Math.min(shapes.length, Math.floor(playhead));
  const sim = count > 0 ? similarities[count - 1] ?? similarities.at(-1) ?? 0 : 0;
  playRead.textContent = `${count} / ${shapes.length} · ${(sim * 100).toFixed(1)}%`;
}
function loop(now: number): void {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  if (playing && shapes.length) {
    playhead = Math.min(shapes.length, playhead + BASE_SHAPES_PER_SEC * speed * dt);
    scrub.value = String(playhead);
    if (playhead >= shapes.length) { playing = false; playBtn.textContent = "▶"; }
  }
  if (renderer && shapes.length) { renderer.render(playhead); setPlayRead(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

playBtn.addEventListener("click", () => {
  if (!shapes.length) return;
  if (!playing) { if (playhead >= shapes.length) playhead = 0; playing = true; playBtn.textContent = "❚❚"; }
  else { playing = false; playBtn.textContent = "▶"; }
});
scrub.addEventListener("input", () => { playing = false; playBtn.textContent = "▶"; playhead = Number(scrub.value); });
speedEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
  b.addEventListener("click", () => {
    speed = Number(b.dataset.speed);
    speedEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
});

// ---- Compare divider ----
function setSplit(frac: number): void {
  frac = Math.max(0, Math.min(1, frac));
  compareOverlay.style.clipPath = `inset(0 ${(1 - frac) * 100}% 0 0)`;
  compareHandle.style.left = `${frac * 100}%`;
}
setSplit(0.5);
compareBtn.addEventListener("click", () => {
  const on = compareBtn.getAttribute("aria-pressed") !== "true";
  compareBtn.setAttribute("aria-pressed", String(on));
  viewer.classList.toggle("compare-on", on);
});
let dragging = false;
const dragTo = (clientX: number) => {
  const rect = viewer.getBoundingClientRect();
  setSplit((clientX - rect.left) / rect.width);
};
compareHandle.addEventListener("pointerdown", (e) => { dragging = true; compareHandle.setPointerCapture(e.pointerId); });
compareHandle.addEventListener("pointermove", (e) => { if (dragging) dragTo(e.clientX); });
compareHandle.addEventListener("pointerup", () => { dragging = false; });

// ---- Export ----
pngBtn.addEventListener("click", () => {
  if (image && shapes.length) exportPng(shapes, bg, image.raster.width, image.fullWidth, image.fullHeight);
});
svgBtn.addEventListener("click", () => {
  if (image && shapes.length) exportSvg(shapes, bg, image.raster.width, image.fullWidth, image.fullHeight);
});

// Start on the first sample so the app is never blank.
loadSource(SAMPLES[0].make(), 600, 400);
