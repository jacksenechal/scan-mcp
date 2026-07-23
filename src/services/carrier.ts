import { execa } from "execa";
import type { AppContext } from "../context.js";

/** Number of row samples the row-mean gray profile is downsampled to. */
export const PROFILE_SAMPLES = 256;

export type Box = { x: number; y: number; w: number; h: number };

export type ConnectedComponent = { x: number; y: number; w: number; h: number; area: number; color: string };

// ---------------------------------------------------------------------------
// Pure functions (no I/O)
// ---------------------------------------------------------------------------

/**
 * Parse ImageMagick `txt:-` output of a 1xN grayscale image into an array of
 * N luminance means normalized to 0..1, ordered by row.
 */
export function parseGrayProfile(txt: string): number[] {
  const rows: { y: number; value: number }[] = [];
  const lineRe = /^\s*(\d+),(\d+):\s*\([^)]*\)\s*#[0-9A-Fa-f]+\s*(.+?)\s*$/;
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = lineRe.exec(line);
    if (!m) continue;
    const y = parseInt(m[2], 10);
    const value = colorSpecToUnit(m[3]);
    if (value === null) continue;
    rows.push({ y, value });
  }
  rows.sort((a, b) => a.y - b.y);
  return rows.map((r) => r.value);
}

/** Parse a trailing color spec (`gray(NNN)`, `gray(NN%)`, `srgb(r,g,b)`) into a 0..1 unit value. */
function colorSpecToUnit(spec: string): number | null {
  let m = /gray\((\d+(?:\.\d+)?)%\)/i.exec(spec);
  if (m) return parseFloat(m[1]) / 100;

  m = /gray\((\d+(?:\.\d+)?)\)/i.exec(spec);
  if (m) return parseFloat(m[1]) / 255;

  m = /srgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/i.exec(spec);
  if (m) {
    const avg = (parseFloat(m[1]) + parseFloat(m[2]) + parseFloat(m[3])) / 3;
    return avg / 255;
  }

  return null;
}

export type DetectBandOptions = {
  darkThreshold?: number;
  maxStartFrac?: number;
  minThicknessSamples?: number;
  maxThicknessFrac?: number;
  maxGapSamples?: number;
};

/**
 * Find the carrier band as the first contiguous run of "dark" samples. The
 * leading-edge pattern always sits within the top few percent of the page
 * (the sheet is fed pattern-first), so only the very first dark run is
 * considered; if it doesn't qualify, there is no carrier band.
 */
export function detectBandFromRowMeans(
  means: number[],
  opts: DetectBandOptions = {}
): { start: number; end: number } | null {
  const { darkThreshold = 0.55, maxStartFrac = 0.08, minThicknessSamples = 2, maxThicknessFrac = 0.12, maxGapSamples = 4 } = opts;
  const n = means.length;
  if (n === 0) return null;

  let start = -1;
  for (let i = 0; i < n; i++) {
    if (means[i] < darkThreshold) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = start;
  while (end + 1 < n && means[end + 1] < darkThreshold) end++;

  // Merge subsequent dark runs separated by short light gaps: patterns like the
  // Fujitsu filmstrip have a row of white sprocket squares inside the band, which
  // splits it into two dark runs in the profile.
  for (;;) {
    let next = end + 1;
    while (next < n && means[next] >= darkThreshold) next++;
    if (next >= n || next - end - 1 > maxGapSamples || next - start + 1 > maxThicknessFrac * n) break;
    end = next;
    while (end + 1 < n && means[end + 1] < darkThreshold) end++;
  }

  const length = end - start + 1;
  const maxStart = maxStartFrac * n;
  const maxThickness = maxThicknessFrac * n;
  if (start <= maxStart && length >= minThicknessSamples && length <= maxThickness) {
    return { start, end };
  }
  return null;
}

/** Convert a band in sample-index space to inclusive pixel rows in an imageHeight-tall image. */
export function bandSamplesToRows(band: { start: number; end: number }, samples: number, imageHeight: number): [number, number] {
  const startRow = Math.floor((band.start / samples) * imageHeight);
  const endRow = Math.min(imageHeight - 1, Math.ceil(((band.end + 1) / samples) * imageHeight));
  return [startRow, endRow];
}

/**
 * Parse `-define connected-components:verbose=true` output lines, e.g.:
 * `  2: 313x412+44+0 200.0,270.9 128561 gray(255)`
 * (format: `id: WxH+X+Y centroidX,centroidY area color`).
 */
export function parseConnectedComponents(verbose: string): ConnectedComponent[] {
  const out: ConnectedComponent[] = [];
  const lineRe = /^\s*\d+:\s+(\d+)x(\d+)\+(\d+)\+(\d+)\s+[\d.\-]+,[\d.\-]+\s+(\d+)\s+(.+?)\s*$/;
  for (const line of verbose.split(/\r?\n/)) {
    if (!line || /^\s*Objects\s*\(/.test(line)) continue;
    const m = lineRe.exec(line);
    if (!m) continue;
    out.push({
      w: parseInt(m[1], 10),
      h: parseInt(m[2], 10),
      x: parseInt(m[3], 10),
      y: parseInt(m[4], 10),
      area: parseInt(m[5], 10),
      color: m[6],
    });
  }
  return out;
}

/**
 * Among components whose color is "light" (gray/srgb value >= 200/255), pick the
 * largest by area. Returns null if none qualify, or if the winner is too small
 * (< 2% of the image area) to plausibly be the document.
 */
export function pickDocumentComponent(components: ConnectedComponent[], imgW: number, imgH: number): Box | null {
  const light = components.filter((c) => {
    const unit = colorSpecToUnit(c.color);
    return unit !== null && unit * 255 >= 200;
  });
  if (light.length === 0) return null;

  const winner = light.reduce((best, c) => (c.area > best.area ? c : best), light[0]);
  const minArea = 0.02 * imgW * imgH;
  if (winner.area < minArea) return null;

  return { x: winner.x, y: winner.y, w: winner.w, h: winner.h };
}

/** Add marginFrac of the larger image dimension on each side; clamp to the image bounds. */
export function expandAndClampBox(box: Box, imgW: number, imgH: number, marginFrac = 0.01, minY = 0): Box {
  const margin = marginFrac * Math.max(imgW, imgH);
  const x0 = clamp(box.x - margin, 0, imgW);
  const y0 = clamp(box.y - margin, minY, imgH);
  const x1 = clamp(box.x + box.w + margin, 0, imgW);
  const y1 = clamp(box.y + box.h + margin, minY, imgH);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/** Scale a bbox between resolutions (round outward: floor origins, ceil extents; clamp). */
export function scaleBox(box: Box, fromW: number, fromH: number, toW: number, toH: number): Box {
  const sx = toW / fromW;
  const sy = toH / fromH;
  const x0 = clamp(Math.floor(box.x * sx), 0, toW);
  const y0 = clamp(Math.floor(box.y * sy), 0, toH);
  const x1 = clamp(Math.ceil((box.x + box.w) * sx), 0, toW);
  const y1 = clamp(Math.ceil((box.y + box.h) * sy), 0, toH);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// I/O wrappers
// ---------------------------------------------------------------------------

export async function getImageSize(imagePath: string, ctx: AppContext): Promise<{ width: number; height: number }> {
  const { stdout } = await execa(ctx.config.IM_CONVERT_BIN, [imagePath, "-format", "%w %h", "info:"], { shell: false });
  const [w, h] = stdout.trim().split(/\s+/).map((s) => parseInt(s, 10));
  return { width: w, height: h };
}

export async function computeRowMeans(imagePath: string, ctx: AppContext): Promise<number[]> {
  const { stdout } = await execa(
    ctx.config.IM_CONVERT_BIN,
    [imagePath, "-colorspace", "Gray", "-resize", `1x${PROFILE_SAMPLES}!`, "-depth", "8", "txt:-"],
    { shell: false }
  );
  return parseGrayProfile(stdout);
}

export type CarrierDetection = {
  detected: boolean;
  band_rows?: [number, number];
  width: number;
  height: number;
};

export async function detectCarrierSheet(imagePath: string, ctx: AppContext): Promise<CarrierDetection> {
  const { width, height } = await getImageSize(imagePath, ctx);
  const means = await computeRowMeans(imagePath, ctx);
  const band = detectBandFromRowMeans(means);
  if (!band) return { detected: false, width, height };
  const band_rows = bandSamplesToRows(band, PROFILE_SAMPLES, height);
  return { detected: true, band_rows, width, height };
}

export type CropResult = { crop_box: { x: number; y: number; width: number; height: number } };

export async function cropCarrierSheet(
  imagePath: string,
  outPath: string,
  bandRows: [number, number],
  dims: { width: number; height: number },
  ctx: AppContext
): Promise<CropResult> {
  const { width, height } = dims;
  const chopY = bandRows[1] + Math.round(0.01 * height);
  const fallbackBox: Box = { x: 0, y: chopY, w: width, h: Math.max(0, height - chopY) };

  const box = await computeDocumentBox(imagePath, chopY, width, height, ctx).catch(() => null);
  const cropBox = box ?? fallbackBox;

  await execa(
    ctx.config.IM_CONVERT_BIN,
    [imagePath, "-crop", `${cropBox.w}x${cropBox.h}+${cropBox.x}+${cropBox.y}`, "+repage", outPath],
    { shell: false }
  );

  return { crop_box: { x: cropBox.x, y: cropBox.y, width: cropBox.w, height: cropBox.h } };
}

async function computeDocumentBox(
  imagePath: string,
  chopY: number,
  width: number,
  height: number,
  ctx: AppContext
): Promise<Box | null> {
  const srcW = width;
  const srcH = height - chopY;
  if (srcW <= 0 || srcH <= 0) return null;

  const scale = Math.min(400 / srcW, 400 / srcH, 1);
  const analysisW = Math.max(1, Math.round(srcW * scale));
  const analysisH = Math.max(1, Math.round(srcH * scale));

  const { stdout } = await execa(
    ctx.config.IM_CONVERT_BIN,
    [
      imagePath,
      "-crop",
      `${srcW}x${srcH}+0+${chopY}`,
      "+repage",
      "-colorspace",
      "Gray",
      "-resize",
      "400x400",
      "-auto-threshold",
      "Otsu",
      "-define",
      "connected-components:verbose=true",
      "-define",
      "connected-components:area-threshold=100",
      "-connected-components",
      "8",
      "null:",
    ],
    { shell: false }
  );

  const components = parseConnectedComponents(stdout);
  const picked = pickDocumentComponent(components, analysisW, analysisH);
  if (!picked) return null;

  const scaled = scaleBox(picked, analysisW, analysisH, srcW, srcH);
  const offset: Box = { x: scaled.x, y: scaled.y + chopY, w: scaled.w, h: scaled.h };
  // 2.5% margin: thresholding classifies dark document borders (e.g. certificate
  // ornaments) as background, so the raw bbox can sit inside the paper edge.
  return expandAndClampBox(offset, width, height, 0.025, chopY);
}
