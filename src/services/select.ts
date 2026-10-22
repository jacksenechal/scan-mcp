import type { AppContext } from "../context.js";
import type { DeviceOptions } from "./backends/backend.js";

export type SelectionInput = {
  desiredSource?: string;
  desiredResolutionDpi?: number;
};

export type SelectionResult = {
  deviceId: string;
  score: number;
  rationale: string[];
};

export async function selectDevice(
  desired: SelectionInput,
  ctx: AppContext,
  lastUsedId?: string
): Promise<SelectionResult | null> {
  const { config, backend } = ctx;
  const devices = await backend.listDevices(ctx);
  if (devices.length === 0) return null;

  const results: SelectionResult[] = [];
  for (const d of devices) {
    const backendPrefix = String(d.id.split(":")[0] || "");
    // Exclude backends outright (only meaningful for SANE-style backend:name device IDs)
    if (config.SCAN_EXCLUDE_BACKENDS.includes(backendPrefix)) {
      results.push({ deviceId: d.id, score: -Infinity, rationale: ["excluded backend:" + backendPrefix] });
      continue;
    }
    let score = 0;
    const rationale: string[] = [];
    try {
      const opts: DeviceOptions = await backend.getDeviceOptions(d.id, ctx);
      const sources = opts.sources ?? [];
      const resolutions = opts.resolutions ?? [];
      const hasAdfDuplex = sources.includes("ADF Duplex");
      const hasAdf = hasAdfDuplex || sources.includes("ADF");

      if (desired.desiredSource && /ADF/.test(desired.desiredSource)) {
        if (hasAdfDuplex) {
          score += 120;
          rationale.push("supports ADF Duplex");
        } else if (hasAdf) {
          score += 100;
          rationale.push("supports ADF");
        } else {
          score -= 50;
          rationale.push("no ADF support");
        }
      } else {
        if (hasAdfDuplex) {
          score += 40;
          rationale.push("has feeder (duplex)");
        } else if (hasAdf) {
          score += 30;
          rationale.push("has feeder");
        }
      }

      if (desired.desiredResolutionDpi && resolutions.includes(desired.desiredResolutionDpi)) {
        score += 10;
        rationale.push(`supports ${desired.desiredResolutionDpi}dpi`);
      }

      if (hasAdfDuplex) {
        score += 10;
        rationale.push("duplex capable");
      }

      if (config.SCAN_PREFER_BACKENDS.includes(backendPrefix)) {
        score += 5;
        rationale.push("preferred backend:" + backendPrefix);
      }
    } catch {
      score -= 5;
      rationale.push("options probe failed");
    }

    if (backendPrefix === "v4l") {
      score -= 100; // treat as camera-like
      rationale.push("camera backend penalty");
    }

    if (lastUsedId && d.id === lastUsedId) {
      score += 1;
      rationale.push("last used");
    }

    results.push({ deviceId: d.id, score, rationale });
  }

  results.sort((a, b) => (b.score - a.score) || a.deviceId.localeCompare(b.deviceId));
  const top = results[0];
  if (!top || !isFinite(top.score)) return null;
  return top;
}
