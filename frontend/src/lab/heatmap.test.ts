import { describe, expect, it } from "vitest";
import { HeatGrid, PALETTE, containRect } from "./heatmap";

describe("heatmap", () => {
  it("glows around a point and is hottest at it", () => {
    const g = new HeatGrid(400, 200, 20, 4);
    for (let i = 0; i < 20; i++) g.add(200, 100);
    const c = Math.floor(200 / 4), r = Math.floor(100 / 4);
    expect(g.heatAt(c, r)).toBeCloseTo(1, 5);
    expect(g.heatAt(c + 5, r)).toBeLessThan(g.heatAt(c, r));
    expect(g.heatAt(c + 5, r)).toBeCloseTo(g.heatAt(c - 5, r), 5); // symmetric
    expect(g.heatAt(0, 0)).toBeLessThan(0.001); // far corner stays cold
  });

  it("ignores points outside the area and non-finite ones", () => {
    const g = new HeatGrid(100, 100, 10);
    g.add(-5, 50); g.add(50, 150); g.add(NaN, 10); g.add(10, Infinity);
    expect(g.count).toBe(0);
    g.add(0, 0); g.add(100, 100); // the edges themselves count
    expect(g.count).toBe(2);
  });

  it("a couple of stray points stay dim instead of flashing white", () => {
    const g = new HeatGrid(100, 100, 10);
    g.add(50, 50);
    expect(g.heatAt(12, 12)).toBeLessThan(0.5);
  });

  it("paints empty cells transparent and the hot core opaque", () => {
    const g = new HeatGrid(200, 200, 10);
    for (let i = 0; i < 30; i++) g.add(100, 100);
    const out = new Uint8ClampedArray(g.cols * g.rows * 4);
    g.fillRGBA(out);
    expect(out[3]).toBe(0); // corner
    const core = (Math.floor(100 / 4) * g.cols + Math.floor(100 / 4)) * 4;
    expect(out[core + 3]).toBe(255);
  });

  it("palette fades in from transparent and never gets less opaque", () => {
    expect(PALETTE[3]).toBe(0);
    for (let i = 1; i < 256; i++) expect(PALETTE[i * 4 + 3]).toBeGreaterThanOrEqual(PALETTE[(i - 1) * 4 + 3]);
  });

  it("fits an image inside the screen without distorting it", () => {
    const r = containRect(1000, 1000, 1600, 900); // wide image on a square screen: bars above and below
    expect(r.w).toBe(1000);
    expect(r.h).toBeCloseTo(562.5, 5);
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo(218.75, 5);
    const t = containRect(1600, 900, 100, 100); // small square image is scaled up to the screen height
    expect(t.h).toBe(900);
    expect(t.x).toBe(350);
  });
});
