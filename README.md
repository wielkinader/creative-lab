# Creative Lab

A series of small creative-technical experiments, each self-contained and running
entirely in the browser. One repo, one GitHub Pages site.

**Live:** https://wielkinader.github.io/creative-lab/

## Projects

| Project | What it does | Links |
| --- | --- | --- |
| [Shape Painter](projects/shape-painter) | Rebuilds a photo out of overlapping translucent shapes and replays it as a timelapse. | [live](https://wielkinader.github.io/creative-lab/projects/shape-painter/) · [readme](projects/shape-painter/README.md) |

## Structure

```
creative-lab/
  index.html            portfolio landing page
  projects/
    shape-painter/      Vite + TypeScript app
  shared/               shared styles/utils (grows with the series)
  .github/workflows/    GitHub Pages deploy
```

Each project is deployed as static files. The landing page is plain HTML; project
apps are built with Vite and assembled into the published site by the deploy workflow.
