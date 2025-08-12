import { describe, it, expect } from "vitest";
import { planScanCommands, segmentPages } from "../src/services/jobs";
import { loadConfig } from "../src/config";
import path from "path";

describe("scan command planning", () => {
  const config = loadConfig();
  const runDir = path.resolve("/tmp/dummy-run");

  it("prefers scanadf for ADF sources with fallback to scanimage", () => {
    const cmds = planScanCommands({ source: "ADF Duplex", device_id: "dev" }, runDir, config);
    expect(cmds[0].bin).toContain("scanadf");
    expect(cmds[1].bin).toContain("scanimage");
    expect(cmds[0].args.join(" ")).toContain("--batch=");
  });

  it("uses scanimage only for flatbed", () => {
    const cmds = planScanCommands({ source: "Flatbed", device_id: "dev" }, runDir, config);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].bin).toContain("scanimage");
  });

  it("adds -x/-y for standard page sizes", () => {
    const letter = planScanCommands({ device_id: "dev", page_size: "Letter" }, runDir, config)[0].args.join(" ");
    expect(letter).toMatch(/-x 215\.9mm -y 279\.4mm/);
    const a4 = planScanCommands({ device_id: "dev", page_size: "A4" }, runDir, config)[0].args.join(" ");
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
