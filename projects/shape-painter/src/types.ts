// Shared types for the algorithm, worker, and renderer.

export type ShapeType = "rectangle" | "triangle" | "circle";

/** An RGB colour, each channel 0-255. Alpha is stored on the shape. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// ---- Geometry ----
// Geometry is stored in scoring-resolution pixel coordinates but is
// resolution-independent: to render at full size, scale every coordinate by
// (fullWidth / scoringWidth). Rectangles are axis-aligned (inclusive integer
// bounds); circles and triangles carry float geometry.

export interface RectGeom {
  type: "rectangle";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CircleGeom {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface TriangleGeom {
  type: "triangle";
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
}

export type Geom = RectGeom | CircleGeom | TriangleGeom;

export interface ShapeStyle {
  color: Rgb;
  alpha: number;
  /** Order the shape was committed, starting at 0. */
  index: number;
}

/**
 * A committed shape: its geometry plus colour/alpha/order. Shapes are the
 * entire output of the algorithm; the image is just a replay of them in order.
 */
export type Shape =
  | (RectGeom & ShapeStyle)
  | (CircleGeom & ShapeStyle)
  | (TriangleGeom & ShapeStyle);

/** A single horizontal run of covered pixels on row `y`, from `xa` to `xb`. */
export interface Span {
  y: number;
  xa: number;
  xb: number;
}

/** An RGBA raster: length = width * height * 4. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// ---- Worker protocol ----

export interface StartMessage {
  type: "start";
  target: Raster;
  budget: number;
  /** Which shape types the optimiser may use. Defaults to all three. */
  enabledTypes?: ShapeType[];
  /** Shape opacity override (advanced). Defaults to the config value. */
  alpha?: number;
}

export interface ProgressMessage {
  type: "progress";
  /** 1-based count of shapes committed so far. */
  count: number;
  budget: number;
  /** Similarity in [0,1], where 1 is a perfect match. */
  similarity: number;
  shape: Shape;
}

export interface DoneMessage {
  type: "done";
  shapes: Shape[];
  similarity: number;
}

export type WorkerOutMessage = ProgressMessage | DoneMessage;
