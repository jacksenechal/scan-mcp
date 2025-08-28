import { execa } from "execa";
import type { AppContext } from "../context.js";

export type Device = {
  id: string;
  vendor?: string;
  model?: string;
  saneName?: string;
  capabilities?: {
    adf?: boolean;
    duplex?: boolean;
    color_modes?: string[];
    resolutions?: number[];
    page_sizes?: string[];
  };
};

export async function listDevices(ctx: AppContext): Promise<Device[]> {
  const { config, logger } = ctx;
  if (config.SCAN_MOCK) {
    return [
      {
        id: "epjitsu:libusb:001:004",
        vendor: "FUJITSU",
        model: "ScanSnap",
        saneName: "epjitsu0",
        capabilities: { adf: true, duplex: true, color_modes: ["Color", "Gray", "Lineart"], resolutions: [200, 300, 600] },
      },
    ];
  }

  try {
    const { stdout } = await execa(config.SCANIMAGE_BIN, ["-L"], { shell: false });
    const devices = parseScanimageList(stdout);
    // Filter out excluded backends (e.g., v4l by default)
    const filtered = devices.filter((d) => {
      const backend = String(d.id.split(":")[0] || "");
      return !config.SCAN_EXCLUDE_BACKENDS.includes(backend);
    });
    return filtered;
  } catch (err) {
    logger.error({ err }, "Failed to list devices");
    return [];
  }
}

export function parseScanimageList(text: string): Device[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const result: Device[] = [];
  for (const line of lines) {
    // Example: device `epjitsu:libusb:001:004' is a FUJITSU ScanSnap S1500 scanner
    const m = line.match(/^device `(.+?)\' is a (.+)$/);
    if (!m) continue;
    const id = m[1];
    const desc = m[2];
    // Very loose vendor/model parse
    const parts = desc.replace(/\s+scanner.*/i, "").split(/\s+/);
    const vendor = parts[0];
    const model = parts.slice(1).join(" ") || undefined;
    result.push({ id, vendor, model });
  }
  return result;
}

export type DeviceOptions = {
  sources?: string[];
  color_modes?: string[];
  resolutions?: number[];
  adf?: boolean;
  duplex?: boolean;
};

export async function getDeviceOptions(deviceId: string, ctx: AppContext): Promise<DeviceOptions> {
  const { config, logger } = ctx;
  if (config.SCAN_MOCK) {
    return {
      sources: ["Flatbed", "ADF", "ADF Duplex"],
      color_modes: ["Color", "Gray", "Lineart"],
      resolutions: [200, 300, 600],
      adf: true,
      duplex: true,
    };
  }

  try {
    const { stdout } = await execa(config.SCANIMAGE_BIN, ["-A", "-d", deviceId], { shell: false });
    return parseScanimageOptions(stdout);
  } catch (err) {
    logger.error({ err, deviceId }, "Failed to get device options");
    return {};
  }
}

export function parseScanimageOptions(text: string): DeviceOptions {
  const opts: DeviceOptions = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/--source\b/.test(line)) {
      const values = extractEnumValues(line);
      opts.sources = values;
      opts.adf = values.some((v) => /ADF/i.test(v));
      opts.duplex = values.some((v) => /duplex/i.test(v));
    }
    if (/--mode\b/.test(line)) {
      opts.color_modes = extractEnumValues(line);
    }
    if (/--resolution\b/.test(line)) {
      const nums = Array.from(line.matchAll(/(\d{2,4})\s*dpi?/gi)).map((m) => parseInt(m[1], 10));
      // Fallback: any bare integers
      if (nums.length === 0) {
        const bare = Array.from(line.matchAll(/\b(\d{2,4})\b/g)).map((m) => parseInt(m[1], 10));
        if (bare.length) opts.resolutions = Array.from(new Set(bare)).sort((a, b) => a - b);
      } else {
        opts.resolutions = Array.from(new Set(nums)).sort((a, b) => a - b);
      }
    }
  }
  return opts;
}

function extractEnumValues(line: string): string[] {
  // Extract tokens like 'Flatbed|ADF|ADF Duplex' or '[Color|Gray|Lineart]'
  const m = line.match(/([\w\s\/\-]+(?:\|[\w\s\/\-]+)+)/);
  if (!m) return [];
  return m[1]
    .split("|")
    .map((s) => s.trim().replace(/^--[a-z\-]+\s+/i, ""))
    .filter(Boolean);
}
