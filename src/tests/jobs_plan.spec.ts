import { describe, it, expect, vi } from "vitest";
import path from "path";
import { planScanCommands, segmentPages } from "../services/jobs.js";
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
