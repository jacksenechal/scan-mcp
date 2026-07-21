import { describe, it, expect, vi } from "vitest";
import path from "path";
import { planScanCommands, segmentPages, resolveSourceForDevice } from "../services/jobs.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";

const config: AppConfig = {
  SCAN_MOCK: true,
  INBOX_DIR: "/tmp",
  LOG_LEVEL: "silent",
  SCAN_EXCLUDE_BACKENDS: [],
  SCAN_PREFER_BACKENDS: [],
  SCANIMAGE_BIN: "scanimage",
  TIFFCP_BIN: "tiffcp",
  IM_CONVERT_BIN: "convert",
  PERSIST_LAST_USED_DEVICE: true,
};
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
const ctx: AppContext = { config, logger };

describe("command planning", () => {
  const runDir = path.resolve("/tmp/dummy-run");

  it("uses scanimage for ADF sources", () => {
    const cmds = planScanCommands({ source: "ADF Duplex", device_id: "dev" }, runDir, ctx);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].bin).toContain("scanimage");
    expect(cmds[0].args.join(" ")).toContain("--batch=");
  });

  it("uses scanimage for flatbed", () => {
    const cmds = planScanCommands({ source: "Flatbed", device_id: "dev" }, runDir, ctx);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].bin).toContain("scanimage");
  });

  it("adds -x/-y for standard page sizes", () => {
    const letter = planScanCommands({ device_id: "dev", page_size: "Letter" }, runDir, ctx)[0].args.join(" ");
    expect(letter).toMatch(/-x 215\.9mm -y 279\.4mm/);
    const a4 = planScanCommands({ device_id: "dev", page_size: "A4" }, runDir, ctx)[0].args.join(" ");
    expect(a4).toMatch(/-x 210mm -y 297mm/);
  });
});

describe("resolveSourceForDevice", () => {
  // Fujitsu ScanSnap S1500-style device: reports no plain "ADF" or "Flatbed".
  const scansnap = ["ADF Front", "ADF Back", "ADF Duplex"];

  it("maps generic ADF to ADF Front when device has no plain ADF source", () => {
    expect(resolveSourceForDevice("ADF", scansnap)).toBe("ADF Front");
  });

  it("maps generic ADF Duplex to the device's Duplex source", () => {
    expect(resolveSourceForDevice("ADF Duplex", scansnap)).toBe("ADF Duplex");
  });

  it("prefers an exact match when available", () => {
    const sources = ["Flatbed", "ADF", "ADF Duplex"];
    expect(resolveSourceForDevice("ADF", sources)).toBe("ADF");
    expect(resolveSourceForDevice("ADF Duplex", sources)).toBe("ADF Duplex");
    expect(resolveSourceForDevice("Flatbed", sources)).toBe("Flatbed");
  });

  it("prefers a non-duplex ADF source over a duplex one when mapping generic ADF", () => {
    expect(resolveSourceForDevice("ADF", ["ADF Duplex", "ADF Simplex"])).toBe("ADF Simplex");
  });

  it("falls back to any ADF-containing source if nothing else matches", () => {
    expect(resolveSourceForDevice("ADF", ["ADF Duplex"])).toBe("ADF Duplex");
  });

  it("maps Flatbed to a source containing Flatbed", () => {
    expect(resolveSourceForDevice("Flatbed", ["Document Table (Flatbed)", "ADF Front"])).toBe("Document Table (Flatbed)");
  });

  it("throws a clear error listing supported sources when nothing matches", () => {
    expect(() => resolveSourceForDevice("Flatbed", scansnap)).toThrow(
      /Flatbed.*not supported.*ADF Front, ADF Back, ADF Duplex/s
    );
  });
});

describe("page segmentation", () => {
  it("splits by page_count", () => {
    const segs = segmentPages([1, 2, 3, 4, 5], { type: "page_count", page_count: 2 });
    expect(segs).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns single segment when no policy", () => {
    const segs = segmentPages([1, 2, 3]);
    expect(segs).toEqual([[1, 2, 3]]);
  });
});
