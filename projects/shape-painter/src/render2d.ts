// Crude Canvas 2D renderer used in step 2/3 to watch convergence. The real
// display path is the WebGL renderer in a later milestone.

import type { Shape } from "./types.ts";

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
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
