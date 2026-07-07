// GPU display + timelapse renderer. All shapes are triangulated once into a
// single static vertex buffer. Playback is driven entirely by one uniform,
// uPlayhead: a shape with order index i appears as the playhead crosses i,
// scaling and fading in over one unit. So "play", "pause" and "scrub" are all
// just different ways of choosing the playhead value; rendering is one draw call.

import type { Rgb, Shape } from "./types.ts";

const CIRCLE_SEGMENTS = 32;
const RENDER_SCALE = 3; // drawing-buffer supersampling for crisp edges
const FLOATS_PER_VERTEX = 9; // x,y, r,g,b,a, cx,cy, index

const VERT_SRC = `
attribute vec2 aPos;
attribute vec4 aColor;
attribute vec2 aCentroid;
attribute float aIndex;
uniform vec2 uResolution;
uniform float uPlayhead;
varying vec4 vColor;
void main() {
  float a = clamp(uPlayhead - aIndex, 0.0, 1.0);
  float s = a * a * (3.0 - 2.0 * a);        // smoothstep ease for scale-in
  vec2 pos = aCentroid + (aPos - aCentroid) * s;
  vec2 clip = (pos / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y;                          // pixel origin is top-left
  gl_Position = vec4(clip, 0.0, 1.0);
  vColor = vec4(aColor.rgb, aColor.a * a);   // fade in with the same factor
}`;

const FRAG_SRC = `
precision mediump float;
varying vec4 vColor;
void main() { gl_FragColor = vColor; }`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile error: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

/** Push one triangle (three vertices) sharing colour, centroid and index. */
function pushTriangle(
  out: number[],
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  c: Rgb, alpha: number, cx: number, cy: number, index: number,
): void {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const v = (x: number, y: number) => out.push(x, y, r, g, b, alpha, cx, cy, index);
  v(x0, y0); v(x1, y1); v(x2, y2);
}

/** Turn the shape list into an interleaved vertex array. */
function buildVertices(shapes: Shape[]): Float32Array {
  const out: number[] = [];
  for (const s of shapes) {
    if (s.type === "rectangle") {
      const x0 = s.x0, y0 = s.y0, x1 = s.x1 + 1, y1 = s.y1 + 1;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      pushTriangle(out, x0, y0, x1, y0, x1, y1, s.color, s.alpha, cx, cy, s.index);
      pushTriangle(out, x0, y0, x1, y1, x0, y1, s.color, s.alpha, cx, cy, s.index);
    } else if (s.type === "triangle") {
      const cx = (s.ax + s.bx + s.cx) / 3, cy = (s.ay + s.by + s.cy) / 3;
      pushTriangle(out, s.ax, s.ay, s.bx, s.by, s.cx, s.cy, s.color, s.alpha, cx, cy, s.index);
    } else {
      const { cx, cy, r } = s;
      for (let k = 0; k < CIRCLE_SEGMENTS; k++) {
        const a0 = (k / CIRCLE_SEGMENTS) * Math.PI * 2;
        const a1 = ((k + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;
        pushTriangle(
          out,
          cx, cy,
          cx + Math.cos(a0) * r, cy + Math.sin(a0) * r,
          cx + Math.cos(a1) * r, cy + Math.sin(a1) * r,
          s.color, s.alpha, cx, cy, s.index,
        );
      }
    }
  }
  return new Float32Array(out);
}

export class WebGLRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private uResolution: WebGLUniformLocation;
  private uPlayhead: WebGLUniformLocation;
  private vertexCount = 0;
  private width: number;
  private height: number;
  private bg: Rgb = { r: 0, g: 0, b: 0 };

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.width = width;
    this.height = height;
    canvas.width = Math.round(width * RENDER_SCALE);
    canvas.height = Math.round(height * RENDER_SCALE);
    // alpha:false keeps the drawing buffer opaque, so overlapping translucent
    // shapes never make the canvas see-through onto the page behind it.
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(program));
    }
    this.program = program;
    this.buffer = gl.createBuffer()!;
    this.uResolution = gl.getUniformLocation(program, "uResolution")!;
    this.uPlayhead = gl.getUniformLocation(program, "uPlayhead")!;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.BLEND);
    // Standard source-over for RGB; leave the alpha channel untouched (ZERO,ONE)
    // so the buffer stays fully opaque regardless of shape overlap.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  }

  /** Resize the drawing buffer for a new image aspect ratio. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const canvas = this.gl.canvas as HTMLCanvasElement;
    canvas.width = Math.round(width * RENDER_SCALE);
    canvas.height = Math.round(height * RENDER_SCALE);
    this.gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /** Upload a new shape list and background colour. */
  setShapes(shapes: Shape[], bg: Rgb): void {
    this.bg = bg;
    const data = buildVertices(shapes);
    this.vertexCount = data.length / FLOATS_PER_VERTEX;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  }

  /** Draw the scene with the given continuous playhead (0 .. shapeCount). */
  render(playhead: number): void {
    const gl = this.gl;
    gl.clearColor(this.bg.r / 255, this.bg.g / 255, this.bg.b / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.vertexCount === 0) return;

    gl.useProgram(this.program);
    gl.uniform2f(this.uResolution, this.width, this.height);
    gl.uniform1f(this.uPlayhead, playhead);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = FLOATS_PER_VERTEX * 4;
    this.bindAttrib("aPos", 2, stride, 0);
    this.bindAttrib("aColor", 4, stride, 2 * 4);
    this.bindAttrib("aCentroid", 2, stride, 6 * 4);
    this.bindAttrib("aIndex", 1, stride, 8 * 4);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }

  private bindAttrib(name: string, size: number, stride: number, offset: number): void {
    const gl = this.gl;
    const loc = gl.getAttribLocation(this.program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  }
}
