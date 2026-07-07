// Shared types for the algorithm, worker, and renderer.

export type ShapeType = "rectangle" | "triangle" | "circle";

/** An RGB colour, each channel 0-255. Alpha is stored on the shape. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * A committed shape. Geometry is stored in scoring-resolution pixel
 * coordinates but is resolution-independent: to render at full size, scale
 * every coordinate by (fullWidth / scoringWidth). Shapes are the entire
 * output of the algorithm; the image is just a replay of them in order.
 *
 * For step 2 only axis-aligned rectangles exist. Later shape types add their
 * own geometry fields; `type` discriminates.
 */
export interface Shape {
  type: ShapeType;
  /** Axis-aligned bounds, inclusive integer pixel coordinates. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: Rgb;
  alpha: number;
  /** Order the shape was committed, starting at 0. */
  index: number;
}

/** A grayscale-agnostic RGBA raster: length = width * height * 4. */
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
