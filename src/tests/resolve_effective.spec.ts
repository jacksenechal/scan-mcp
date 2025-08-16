import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveEffectiveInput, startScanJob } from "../services/jobs.js";
import * as sane from "../services/sane.js";
import path from "path";
import fs from "fs";
import { type AppConfig } from "../config.js";

const tmpRoot = path.resolve(__dirname, "..", ".tmp-tests");

const config: AppConfig = {
  SCAN_MOCK: true,
  INBOX_DIR: tmpRoot,
  LOG_LEVEL: "silent",
  SCAN_EXCLUDE_BACKENDS: [],
  SCAN_PREFER_BACKENDS: [],
  SCANIMAGE_BIN: "scanimage",
  TIFFCP_BIN: "tiffcp",
  IM_CONVERT_BIN: "convert",
};

describe("resolveEffectiveInput", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers ADF Duplex when duplex is true and supported", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ sources: ["Flatbed", "ADF", "ADF Duplex"], resolutions: [300] });
    const eff = await resolveEffectiveInput({ device_id: "dev", duplex: true }, config);
    expect(eff.source).toBe("ADF Duplex");
  });
});

describe("last-used device persistence (mock)", () => {
  it("writes last used device id to state", async () => {
    const tmp = path.resolve(__dirname, "..", ".tmp-state");
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });

    const testConfig: AppConfig = {
      ...config,
      INBOX_DIR: path.join(tmp, "inbox"),
    };

    await startScanJob({}, testConfig);
    const statePath = path.join(tmp, "..", ".state", "scan-mcp.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const j = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(typeof j.device_id).toBe("string");
    // Clean
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

