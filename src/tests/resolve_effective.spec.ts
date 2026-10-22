import { MockBackend } from "../services/backends/mock.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveEffectiveInput, startScanJob } from "../services/jobs.js";
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
const ctx: AppContext = { config, logger, backend: new MockBackend() };

describe("resolveEffectiveInput", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers ADF Duplex when duplex is true and supported", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ sources: ["Flatbed", "ADF", "ADF Duplex"], resolutions: [300] });
    const eff = await resolveEffectiveInput({ device_id: "dev", duplex: true }, ctx);
    expect(eff.source).toBe("ADF Duplex");
  });

  it("maps a requested generic ADF source to the device's reported source (Fujitsu ScanSnap S1500)", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({
      sources: ["ADF Front", "ADF Back", "ADF Duplex"],
      resolutions: [300],
    });
    const eff = await resolveEffectiveInput({ device_id: "dev", source: "ADF" }, ctx);
    expect(eff.source).toBe("ADF Front");
  });

  it("maps a requested ADF Duplex source to the device's Duplex source", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({
      sources: ["ADF Front", "ADF Back", "ADF Duplex"],
      resolutions: [300],
    });
    const eff = await resolveEffectiveInput({ device_id: "dev", source: "ADF Duplex" }, ctx);
    expect(eff.source).toBe("ADF Duplex");
  });

  it("rejects an unsupported requested source with a clear error instead of running scanimage", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({
      sources: ["ADF Front", "ADF Back", "ADF Duplex"],
      resolutions: [300],
    });
    await expect(resolveEffectiveInput({ device_id: "dev", source: "Flatbed" }, ctx)).rejects.toThrow(
      /Flatbed.*not supported/
    );
  });

  it("picks 300dpi when available", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ resolutions: [200, 300, 600] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("prefers 300 via probe even when missing from list", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ resolutions: [200, 600] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("still uses 300 via probe when all listed > 300", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ resolutions: [400, 600] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("falls back to 300 when device does not report resolutions", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({});
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
  });

  it("at ordinary resolution (300dpi), defaults color mode to Lineart and prefers Lineart > Gray > Color", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color", "Gray", "Lineart"], resolutions: [300] });
    const eff1 = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 300 }, ctx);
    expect(eff1.color_mode).toBe("Lineart");

    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color", "Gray"], resolutions: [300] });
    const eff2 = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 300 }, ctx);
    expect(eff2.color_mode).toBe("Gray");

    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color"], resolutions: [300] });
    const eff3 = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 300 }, ctx);
    expect(eff3.color_mode).toBe("Color");
  });

  it("at high resolution (600dpi and above), defaults color mode to Color and prefers Color > Gray > Lineart (Fujitsu ScanSnap S1500 regression)", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({
      sources: ["ADF Duplex"],
      color_modes: ["Color", "Gray", "Lineart"],
      resolutions: [200, 300, 600],
    });
    const eff1 = await resolveEffectiveInput({ device_id: "dev", source: "ADF Duplex", resolution_dpi: 600 }, ctx);
    expect(eff1.color_mode).toBe("Color");

    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ color_modes: ["Gray", "Lineart"], resolutions: [600] });
    const eff2 = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 600 }, ctx);
    expect(eff2.color_mode).toBe("Gray");

    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ color_modes: ["Lineart"], resolutions: [600] });
    const eff3 = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 600 }, ctx);
    expect(eff3.color_mode).toBe("Lineart");
  });

  it("defaults color mode to Lineart when no resolution_dpi is requested (resolves via the 300dpi default)", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color", "Gray", "Lineart"], resolutions: [300] });
    const eff = await resolveEffectiveInput({ device_id: "dev" }, ctx);
    expect(eff.resolution_dpi).toBe(300);
    expect(eff.color_mode).toBe("Lineart");
  });

  it("honors an explicit color_mode regardless of resolution", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ color_modes: ["Color", "Gray", "Lineart"], resolutions: [300, 600] });
    const atLowRes = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 300, color_mode: "Color" }, ctx);
    expect(atLowRes.color_mode).toBe("Color");

    const atHighRes = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 600, color_mode: "Lineart" }, ctx);
    expect(atHighRes.color_mode).toBe("Lineart");
  });

  it("falls back to Lineart at ordinary resolution and Color at high resolution when the device reports no options", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({});
    const atLowRes = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 300 }, ctx);
    expect(atLowRes.color_mode).toBe("Lineart");

    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({});
    const atHighRes = await resolveEffectiveInput({ device_id: "dev", resolution_dpi: 600 }, ctx);
    expect(atHighRes.color_mode).toBe("Color");
  });

  it("probes 300dpi even when not listed and uses it if accepted", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ resolutions: [50, 600] });
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
      INBOX_DIR: path.join(tmp, "runs", "inbox"),
      PERSIST_LAST_USED_DEVICE: true,
    };
    const testCtx: AppContext = { config: testConfig, logger, backend: new MockBackend() };

    await startScanJob({}, testCtx);
    const statePath = path.join(tmp, ".state", "scan-mcp.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const j = JSON.parse(fs.readFileSync(statePath, "utf8"));
    expect(typeof j.device_id).toBe("string");
    // Clean
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
