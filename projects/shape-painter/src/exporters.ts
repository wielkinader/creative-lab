import type { Rgb, Shape } from "./types.ts";

/** Render the full shape list onto a 2D context, scaled from scoring space. */
export function renderShapes2D(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  bg: Rgb,
  scale: number,
  width: number,
  height: number,
): void {
  ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.scale(scale, scale);
  for (const s of shapes) {
    ctx.fillStyle = `rgba(${s.color.r},${s.color.g},${s.color.b},${s.alpha})`;
    if (s.type === "rectangle") {
      ctx.fillRect(s.x0, s.y0, s.x1 - s.x0 + 1, s.y1 - s.y0 + 1);
    } else if (s.type === "circle") {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
      ctx.lineTo(s.cx, s.cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

/** Export the reconstruction as a PNG at the source's full resolution. */
export function exportPng(
  shapes: Shape[],
  bg: Rgb,
  scoringWidth: number,
  fullWidth: number,
  fullHeight: number,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = fullWidth;
  canvas.height = fullHeight;
  const scale = fullWidth / scoringWidth;
  renderShapes2D(canvas.getContext("2d")!, shapes, bg, scale, fullWidth, fullHeight);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, "shape-painter.png");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

const f2 = (n: number) => Math.round(n * 100) / 100;

/** Export the reconstruction as an SVG (one element per shape, 1:1). */
export function exportSvg(
  shapes: Shape[],
  bg: Rgb,
  scoringWidth: number,
  fullWidth: number,
  fullHeight: number,
): void {
  const scale = fullWidth / scoringWidth;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fullWidth}" height="${fullHeight}" viewBox="0 0 ${fullWidth} ${fullHeight}">`,
    `<rect width="100%" height="100%" fill="rgb(${bg.r},${bg.g},${bg.b})"/>`,
    `<g fill-opacity="1">`,
  ];
  for (const s of shapes) {
    const fill = `fill="rgb(${s.color.r},${s.color.g},${s.color.b})" fill-opacity="${s.alpha}"`;
    if (s.type === "rectangle") {
      const x = f2(s.x0 * scale), y = f2(s.y0 * scale);
      const w = f2((s.x1 - s.x0 + 1) * scale), h = f2((s.y1 - s.y0 + 1) * scale);
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${fill}/>`);
    } else if (s.type === "circle") {
      parts.push(`<circle cx="${f2(s.cx * scale)}" cy="${f2(s.cy * scale)}" r="${f2(s.r * scale)}" ${fill}/>`);
    } else {
      const pts = `${f2(s.ax * scale)},${f2(s.ay * scale)} ${f2(s.bx * scale)},${f2(s.by * scale)} ${f2(s.cx * scale)},${f2(s.cy * scale)}`;
      parts.push(`<polygon points="${pts}" ${fill}/>`);
    }
  }
  parts.push(`</g></svg>`);
  const blob = new Blob([parts.join("\n")], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, "shape-painter.svg");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
