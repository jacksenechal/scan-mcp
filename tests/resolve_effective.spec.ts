import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveEffectiveInput, startScanJob } from "../src/services/jobs";
import * as sane from "../src/services/sane";
import path from "path";
import fs from "fs";

describe("resolveEffectiveInput", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("prefers ADF Duplex when duplex is true and supported", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ sources: ["Flatbed", "ADF", "ADF Duplex"], resolutions: [300] } as any);
    const eff = await resolveEffectiveInput({ device_id: "dev", duplex: true });
    expect(eff.source).toBe("ADF Duplex");
  });
});

describe("last-used device persistence (mock)", () => {
  it("writes last used device id to state", async () => {
    const tmp = path.resolve(__dirname, "..", ".tmp-state");
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    process.env.SCAN_MOCK = "1";
    process.env.INBOX_DIR = path.join(tmp, "inbox");
    const res = await startScanJob({});
    const statePath = path.join(tmp, ".state", "scan-mcp.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const j = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(typeof j.device_id).toBe("string");
    // Clean
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

