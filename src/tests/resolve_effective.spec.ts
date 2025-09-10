import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveEffectiveInput, startScanJob } from "../services/jobs.js";
import * as sane from "../services/sane.js";
import path from "path";
import fs from "fs";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";

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
  PERSIST_LAST_USED_DEVICE: true,
};
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
const ctx: AppContext = { config, logger };

describe("resolveEffectiveInput", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers ADF Duplex when duplex is true and supported", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ sources: ["Flatbed", "ADF", "ADF Duplex"], resolutions: [300] });
    const eff = await resolveEffectiveInput({ device_id: "dev", duplex: true }, ctx);
    expect(eff.source).toBe("ADF Duplex");
  });

  it("picks 300dpi when available", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ resolutions: [200, 300, 600] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("prefers 300 via probe even when missing from list", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ resolutions: [200, 600] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("still uses 300 via probe when all listed > 300", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ resolutions: [400, 600] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("falls back to 300 when device does not report resolutions", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({});
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("defaults color mode to Lineart and prefers Lineart > Gray > Color", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color", "Gray", "Lineart"], resolutions: [300] });
    const eff1 = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff1.color_mode).toBe("Lineart");

    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color", "Gray"], resolutions: [300] });
    const eff2 = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff2.color_mode).toBe("Gray");

    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color"], resolutions: [300] });
    const eff3 = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff3.color_mode).toBe("Color");

    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({});
    const eff4 = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff4.color_mode).toBe("Lineart");
  });

  it("probes 300dpi even when not listed and uses it if accepted", async () => {
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ resolutions: [50, 600] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
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
      PERSIST_LAST_USED_DEVICE: true,
    };
    const testCtx: AppContext = { config: testConfig, logger };

    await startScanJob({}, testCtx);
    const statePath = path.join(tmp, "..", ".state", "scan-mcp.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const j = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(typeof j.device_id).toBe("string");
    // Clean
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
