import { describe, it, expect } from "vitest";
import {
  parseGrayProfile,
  detectBandFromRowMeans,
  bandSamplesToRows,
  parseConnectedComponents,
  pickDocumentComponent,
  expandAndClampBox,
  scaleBox,
  PROFILE_SAMPLES,
} from "../services/carrier.js";

describe("parseGrayProfile", () => {
  it("parses gray(NNN) form", () => {
    const txt = ["# ImageMagick pixel enumeration: 1,3,255,srgb", "0,0: (12593)  #313131  gray(49)", "0,1: (0)  #000000  gray(0)", "0,2: (65535)  #FFFFFF  gray(255)"].join("\n");
    expect(parseGrayProfile(txt)).toEqual([49 / 255, 0, 1]);
  });

  it("parses gray(NN%) form", () => {
    const txt = ["0,0: (0)  #000000  gray(0%)", "0,1: (0)  #7F7F7F  gray(50%)", "0,2: (0)  #FFFFFF  gray(100%)"].join("\n");
    expect(parseGrayProfile(txt)).toEqual([0, 0.5, 1]);
  });

  it("parses srgb(r,g,b) form (averaged)", () => {
    const txt = ["0,0: (0)  #000000  srgb(0,0,0)", "0,1: (0)  #7F7F7F  srgb(100,127,150)"].join("\n");
    const parsed = parseGrayProfile(txt);
    expect(parsed[0]).toBeCloseTo(0);
    expect(parsed[1]).toBeCloseTo((100 + 127 + 150) / 3 / 255);
  });

  it("orders by row and ignores the header line", () => {
    const txt = ["# ImageMagick pixel enumeration: 1,3,255,srgb", "0,2: (0)  #000000  gray(30)", "0,0: (0)  #000000  gray(10)", "0,1: (0)  #000000  gray(20)"].join("\n");
    expect(parseGrayProfile(txt)).toEqual([10 / 255, 20 / 255, 30 / 255]);
  });
});

function buildProfile(n: number, darkRanges: Array<[number, number, number]>, baseline = 0.9): number[] {
  const means = new Array(n).fill(baseline);
  for (const [start, end, value] of darkRanges) {
    for (let i = start; i <= end; i++) means[i] = value;
  }
  return means;
}

describe("detectBandFromRowMeans", () => {
  it("detects a fujitsu-like leading-edge band", () => {
    const means = buildProfile(PROFILE_SAMPLES, [[0, 8, 0.35]]);
    expect(detectBandFromRowMeans(means)).toEqual({ start: 0, end: 8 });
  });

  it("detects a brother-like solid black bar", () => {
    const means = buildProfile(PROFILE_SAMPLES, [[0, 10, 0.03]]);
    expect(detectBandFromRowMeans(means)).toEqual({ start: 0, end: 10 });
  });

  it("returns null for a clean page", () => {
    const means = buildProfile(PROFILE_SAMPLES, []);
    expect(detectBandFromRowMeans(means)).toBeNull();
  });

  it("returns null for a dark-topped photo (exceeds max thickness)", () => {
    const means = buildProfile(PROFILE_SAMPLES, [[0, 120, 0.1]]);
    expect(detectBandFromRowMeans(means)).toBeNull();
  });

  it("returns null when the dark run starts too far down the page", () => {
    const means = buildProfile(PROFILE_SAMPLES, [[40, 50, 0.1]]);
    expect(detectBandFromRowMeans(means)).toBeNull();
  });

  it("returns null for a single-sample noise spike", () => {
    const means = buildProfile(PROFILE_SAMPLES, [[0, 0, 0.1]]);
    expect(detectBandFromRowMeans(means)).toBeNull();
  });

  it("merges dark runs split by a sprocket-square row (fujitsu filmstrip)", () => {
    const means = buildProfile(PROFILE_SAMPLES, [
      [8, 11, 0.2],
      [12, 14, 0.65],
      [15, 20, 0.2],
    ]);
    expect(detectBandFromRowMeans(means)).toEqual({ start: 8, end: 20 });
  });

  it("does not merge across a gap wider than maxGapSamples", () => {
    const means = buildProfile(PROFILE_SAMPLES, [
      [0, 4, 0.2],
      [12, 16, 0.2],
    ]);
    expect(detectBandFromRowMeans(means)).toEqual({ start: 0, end: 4 });
  });
});

describe("bandSamplesToRows", () => {
  it("maps sample indices to pixel rows", () => {
    expect(bandSamplesToRows({ start: 0, end: 8 }, 256, 3300)).toEqual([0, 117]);
  });

  it("clamps end row to imageHeight - 1", () => {
    expect(bandSamplesToRows({ start: 254, end: 255 }, 256, 256)).toEqual([254, 255]);
  });
});

describe("scaleBox", () => {
  it("scales a box between resolutions, rounding outward", () => {
    const box = { x: 10, y: 10, w: 100, h: 200 };
    const scaled = scaleBox(box, 400, 400, 4000, 4000);
    expect(scaled).toEqual({ x: 100, y: 100, w: 1000, h: 2000 });
  });

  it("clamps to the target bounds", () => {
    const box = { x: 0, y: 0, w: 400, h: 400 };
    const scaled = scaleBox(box, 400, 400, 4000, 3000);
    expect(scaled).toEqual({ x: 0, y: 0, w: 4000, h: 3000 });
  });
});

describe("expandAndClampBox", () => {
  it("expands by marginFrac of the larger dimension", () => {
    const box = { x: 100, y: 100, w: 200, h: 200 };
    // imgW=1000, imgH=2000 -> margin = 0.01 * 2000 = 20
    const out = expandAndClampBox(box, 1000, 2000, 0.01, 0);
    expect(out).toEqual({ x: 80, y: 80, w: 240, h: 240 });
  });

  it("clamps x to [0, imgW] and y to [minY, imgH]", () => {
    const box = { x: 5, y: 5, w: 990, h: 100 };
    const out = expandAndClampBox(box, 1000, 200, 0.05, 50);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.x + out.w).toBeLessThanOrEqual(1000);
    expect(out.y).toBeGreaterThanOrEqual(50);
    expect(out.y + out.h).toBeLessThanOrEqual(200);
  });
});

describe("parseConnectedComponents", () => {
  const verbose = [
    "Objects (id: bounding-box centroid area mean-color):",
    "  0: 400x400+0+0 199.5,199.5 160000 gray(0)",
    "  1: 40x40+0+0 19.5,19.5 1200 gray(10)",
    "  2: 313x412+44+0 200.0,270.9 128561 gray(255)",
  ].join("\n");

  it("parses components and skips the header", () => {
    const components = parseConnectedComponents(verbose);
    expect(components).toHaveLength(3);
    expect(components[2]).toEqual({ x: 44, y: 0, w: 313, h: 412, area: 128561, color: "gray(255)" });
  });
});

describe("pickDocumentComponent", () => {
  it("picks the largest light component", () => {
    const components = [
      { x: 0, y: 0, w: 400, h: 400, area: 160000, color: "gray(0)" },
      { x: 0, y: 0, w: 40, h: 40, area: 1200, color: "gray(255)" },
      { x: 44, y: 0, w: 313, h: 412, area: 128561, color: "gray(255)" },
    ];
    expect(pickDocumentComponent(components, 400, 400)).toEqual({ x: 44, y: 0, w: 313, h: 412 });
  });

  it("returns null when no light component qualifies (dark only)", () => {
    const components = [{ x: 0, y: 0, w: 400, h: 400, area: 160000, color: "gray(0)" }];
    expect(pickDocumentComponent(components, 400, 400)).toBeNull();
  });

  it("returns null when the largest light component is too small", () => {
    const components = [{ x: 0, y: 0, w: 20, h: 20, area: 400, color: "gray(255)" }];
    // 400 / (400*400) = 0.25% < 2%
    expect(pickDocumentComponent(components, 400, 400)).toBeNull();
  });
});
