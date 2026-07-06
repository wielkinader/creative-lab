// Placeholder entry point. The algorithm, worker, WebGL renderer and controls
// arrive in later milestones. This just proves the build + deploy pipeline works.

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main style="
    min-height:100dvh;display:grid;place-items:center;
    font-family:ui-sans-serif,system-ui,sans-serif;
    background:#0d0f12;color:#e7e9ec;text-align:center;padding:24px;">
    <div>
      <h1 style="font-size:clamp(2rem,6vw,3rem);letter-spacing:-.02em;margin:0 0 12px;">
        Shape Painter
      </h1>
      <p style="color:#9aa1ab;max-width:44ch;margin:0 auto;line-height:1.6;">
        Rebuilds a photo out of a few hundred overlapping shapes, then replays it
        as a timelapse. Under construction.
      </p>
      <p style="color:#6ee7b7;margin-top:28px;font-size:.9rem;">Scaffold live ✓</p>
    </div>
  </main>
`;
