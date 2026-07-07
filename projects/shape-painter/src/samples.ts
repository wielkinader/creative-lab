// Bundled sample images so the app works instantly with zero uploads and no
// external assets. Drawn procedurally onto canvases. Users can upload their
// own photos for the full effect.

export interface Sample {
  name: string;
  make: () => HTMLCanvasElement;
}

function canvas(w = 600, h = 400): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

function sunset(): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const { width: W, height: H } = c;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#2b1055");
  sky.addColorStop(0.45, "#7b3f6f");
  sky.addColorStop(0.72, "#e0685b");
  sky.addColorStop(1, "#f7b267");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffd479";
  ctx.beginPath(); ctx.arc(W * 0.68, H * 0.6, 58, 0, Math.PI * 2); ctx.fill();

  // water with a reflection band
  const water = ctx.createLinearGradient(0, H * 0.72, 0, H);
  water.addColorStop(0, "#b65a4e");
  water.addColorStop(1, "#3a2140");
  ctx.fillStyle = water; ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.fillStyle = "rgba(255,212,121,0.5)";
  ctx.fillRect(W * 0.6, H * 0.72, 60, H * 0.28);

  ctx.fillStyle = "#1c1230";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.72);
  ctx.lineTo(W * 0.2, H * 0.6); ctx.lineTo(W * 0.34, H * 0.72);
  ctx.lineTo(0, H * 0.72); ctx.fill();
  return c;
}

function mountains(): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const { width: W, height: H } = c;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0f2a43");
  sky.addColorStop(1, "#7ea8c4");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#eaf1f5";
  ctx.beginPath(); ctx.arc(W * 0.82, H * 0.22, 34, 0, Math.PI * 2); ctx.fill();

  const ridge = (base: number, color: string, jag: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, base);
    for (let x = 0; x <= W; x += W / 8) {
      ctx.lineTo(x, base + Math.sin(x * jag) * 34 - (x / W) * 20);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  };
  ridge(H * 0.5, "#2c5a6e", 0.03);
  ridge(H * 0.62, "#24485c", 0.04);
  ridge(H * 0.74, "#183043", 0.05);
  return c;
}

function bloom(): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const { width: W, height: H } = c;
  ctx.fillStyle = "#101418"; ctx.fillRect(0, 0, W, H);
  const blobs: [number, number, number, string][] = [
    [0.3, 0.35, 150, "#ff5d8f"],
    [0.62, 0.5, 170, "#5d9bff"],
    [0.5, 0.7, 130, "#5dffb0"],
    [0.75, 0.28, 110, "#ffd15d"],
    [0.2, 0.7, 120, "#b45dff"],
  ];
  for (const [x, y, r, color] of blobs) {
    const g = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(16,20,24,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  return c;
}

export const SAMPLES: Sample[] = [
  { name: "Sunset", make: sunset },
  { name: "Mountains", make: mountains },
  { name: "Bloom", make: bloom },
];
