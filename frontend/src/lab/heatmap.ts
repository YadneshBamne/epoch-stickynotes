// A small, dependency-free gaze heatmap: every gaze point adds a soft gaussian "glow" to a coarse grid, and the grid is
// coloured with a transparent-to-hot palette. The maths is DOM-free so it can be unit tested; paintHeat() is the only
// part that touches a canvas.

export interface Box { x: number; y: number; w: number; h: number }

/** Where an image of nw x nh ends up when it is fitted (object-contain) inside a vw x vh area. */
export function containRect(vw: number, vh: number, nw: number, nh: number): Box {
  const s = Math.min(vw / nw, vh / nh);
  const w = nw * s, h = nh * s;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

// colour stops: t (0 = nothing, 1 = hottest), r, g, b
const STOPS: [number, number, number, number][] = [
  [0.0, 25, 0, 70],
  [0.25, 95, 20, 170],
  [0.5, 235, 45, 120],
  [0.75, 255, 165, 25],
  [1.0, 255, 248, 180],
];

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 256 RGBA entries: cool purple glow fading in from transparent, through pink and orange, to a pale-yellow core. */
export const PALETTE: Uint8ClampedArray = (() => {
  const out = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const [t0, r0, g0, b0] = STOPS[k], [t1, r1, g1, b1] = STOPS[k + 1];
    const f = (t - t0) / (t1 - t0);
    out[i * 4] = r0 + (r1 - r0) * f;
    out[i * 4 + 1] = g0 + (g1 - g0) * f;
    out[i * 4 + 2] = b0 + (b1 - b0) * f;
    out[i * 4 + 3] = 255 * smooth(0.02, 0.4, t); // the faintest glow stays see-through so the image shows underneath
  }
  return out;
})();

/** How many overlapping gaze points it takes to reach full heat at least, so the first few points do not flash white. */
const MIN_NORM = 6;

export class HeatGrid {
  readonly cols: number;
  readonly rows: number;
  count = 0;
  private v: Float32Array;
  private peak = 0;
  private kernel: Float32Array;
  private kr: number; // kernel radius in cells

  /** width/height: the pixel space points are given in. sigmaPx: how far one gaze point glows. cell: grid resolution in px. */
  constructor(readonly width: number, readonly height: number, sigmaPx: number, readonly cell = 4) {
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.v = new Float32Array(this.cols * this.rows);
    const s = Math.max(0.75, sigmaPx / cell);
    this.kr = Math.ceil(s * 3);
    const d = this.kr * 2 + 1;
    this.kernel = new Float32Array(d * d);
    for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
      const dx = x - this.kr, dy = y - this.kr;
      this.kernel[y * d + x] = Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
    }
  }

  add(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > this.width || y > this.height) return;
    const cx = Math.min(this.cols - 1, Math.floor(x / this.cell)), cy = Math.min(this.rows - 1, Math.floor(y / this.cell));
    const d = this.kr * 2 + 1;
    for (let ky = 0; ky < d; ky++) {
      const gy = cy + ky - this.kr;
      if (gy < 0 || gy >= this.rows) continue;
      for (let kx = 0; kx < d; kx++) {
        const gx = cx + kx - this.kr;
        if (gx < 0 || gx >= this.cols) continue;
        const i = gy * this.cols + gx;
        const nv = this.v[i] + this.kernel[ky * d + kx];
        this.v[i] = nv;
        if (nv > this.peak) this.peak = nv;
      }
    }
    this.count++;
  }

  /** Heat (0..1) of one grid cell, as drawn. */
  heatAt(col: number, row: number): number {
    return Math.pow(this.v[row * this.cols + col] / Math.max(this.peak, MIN_NORM), 0.8);
  }

  /** Colourise into `out` (cols * rows * 4 bytes). */
  fillRGBA(out: Uint8ClampedArray): void {
    const norm = Math.max(this.peak, MIN_NORM);
    for (let i = 0; i < this.v.length; i++) {
      const p = Math.round(255 * Math.pow(this.v[i] / norm, 0.8)) * 4;
      out[i * 4] = PALETTE[p]; out[i * 4 + 1] = PALETTE[p + 1]; out[i * 4 + 2] = PALETTE[p + 2]; out[i * 4 + 3] = PALETTE[p + 3];
    }
  }
}

const scratch = new WeakMap<HeatGrid, HTMLCanvasElement>();

/** Draws the grid over (0,0)-(grid.width, grid.height) of ctx, smoothly scaled up from the coarse grid. */
export function paintHeat(ctx: CanvasRenderingContext2D, grid: HeatGrid, opacity = 1): void {
  let off = scratch.get(grid);
  if (!off) { off = document.createElement("canvas"); off.width = grid.cols; off.height = grid.rows; scratch.set(grid, off); }
  const octx = off.getContext("2d")!;
  const img = octx.createImageData(grid.cols, grid.rows);
  grid.fillRGBA(img.data);
  octx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = opacity;
  ctx.drawImage(off, 0, 0, grid.width, grid.height);
  ctx.restore();
}
