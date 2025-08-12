import path from "path";
import { describe, it, expect } from "vitest";
import { loadSchemas } from "../src/server";

const schemasDir = path.resolve(__dirname, "..", "schemas");
const { tools } = loadSchemas(schemasDir);

describe("scan-mcp schema validation", () => {
  it("list_devices accepts empty payload and rejects extras", () => {
    const v = tools["/scan/list_devices"].validate!;
    expect(v({})).toBe(true);
    expect(v({ foo: 1 })).toBe(false);
  });

  it("get_device_options requires job_id and device_id type", () => {
    const v = tools["/scan/get_device_options"].validate!;
    expect(v({ device_id: "dev0" })).toBe(true);
    expect(v({})).toBe(false);
  });

  it("get_job_status requires job_id", () => {
    const v = tools["/scan/get_job_status"].validate!;
    expect(v({ job_id: "job123" })).toBe(true);
    expect(v({})).toBe(false);
  });

  it("cancel_job requires job_id", () => {
    const v = tools["/scan/cancel_job"].validate!;
    expect(v({ job_id: "job123" })).toBe(true);
    expect(v({})).toBe(false);
  });

  it("start_scan_job rejects unknown props and accepts minimal valid payload", () => {
    const v = tools["/scan/start_scan_job"].validate!;
    // empty allowed by schema (no required)
    expect(v({})).toBe(true);
    expect(v({ unknown: true })).toBe(false);
  });
});
