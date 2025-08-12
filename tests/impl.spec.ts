import path from "path";
import { describe, it, expect } from "vitest";
import { loadSchemas, makeStubImplementations } from "../src/server";

const schemasDir = path.resolve(__dirname, "..", "schemas");
const { tools: rawTools } = loadSchemas(schemasDir);
const tools = makeStubImplementations(rawTools);

describe("scan-mcp stub implementations", () => {
  it("list_devices returns an array of device objects", async () => {
    type Device = { id: string; vendor: string; model: string };
    const devices = (await tools["/scan/list_devices"].impl!({})) as Device[];
    expect(devices.length).toBeGreaterThan(0);
    const dev = devices[0];
    expect(dev.id).toBeDefined();
    expect(dev.vendor).toBeDefined();
    expect(dev.model).toBeDefined();
  });

  it("start_scan_job returns job_id, run_dir, and state", async () => {
    type ScanResult = { job_id: string; run_dir: string; state: string };
    const out = (await tools["/scan/start_scan_job"].impl!({})) as ScanResult;
    expect(out.job_id).toMatch(/^job-/);
    expect(out.run_dir).toContain(out.job_id);
    expect(["running", "completed"]).toContain(out.state);
  });
});
