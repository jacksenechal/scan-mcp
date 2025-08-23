import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../config.js";

const ENV_VARS = [
  "LOG_LEVEL",
  "INBOX_DIR",
  "SCAN_MOCK",
  "SCANIMAGE_BIN",
  "TIFFCP_BIN",
  "IM_CONVERT_BIN",
  "SCAN_EXCLUDE_BACKENDS",
  "SCAN_PREFER_BACKENDS",
];

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_VARS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_VARS) {
    if (originalEnv[key] !== undefined) {
      process.env[key] = originalEnv[key] as string;
    } else {
      delete process.env[key];
    }
  }
});

describe("loadConfig", () => {
  it("uses defaults when env vars not set", () => {
    const cfg = loadConfig();
    expect(cfg.LOG_LEVEL).toBe("info");
    expect(cfg.INBOX_DIR).toBe("scanned_documents/inbox");
    expect(cfg.SCAN_MOCK).toBe(false);
    expect(cfg.SCANIMAGE_BIN).toBe("scanimage");
    expect(cfg.TIFFCP_BIN).toBe("tiffcp");
    expect(cfg.IM_CONVERT_BIN).toBe("convert");
    expect(cfg.SCAN_EXCLUDE_BACKENDS).toEqual(["v4l"]);
    expect(cfg.SCAN_PREFER_BACKENDS).toEqual([]);
  });

  it("parses environment variables", () => {
    process.env.LOG_LEVEL = "debug";
    process.env.INBOX_DIR = "/tmp/inbox";
    process.env.SCAN_MOCK = "true";
    process.env.SCANIMAGE_BIN = "scanimage2";
    process.env.TIFFCP_BIN = "tiffcp2";
    process.env.IM_CONVERT_BIN = "convert2";
    process.env.SCAN_EXCLUDE_BACKENDS = "v4l,net";
    process.env.SCAN_PREFER_BACKENDS = "fujitsu, canon";

    const cfg = loadConfig();
    expect(cfg.LOG_LEVEL).toBe("debug");
    expect(cfg.INBOX_DIR).toBe("/tmp/inbox");
    expect(cfg.SCAN_MOCK).toBe(true);
    expect(cfg.SCANIMAGE_BIN).toBe("scanimage2");
    expect(cfg.TIFFCP_BIN).toBe("tiffcp2");
    expect(cfg.IM_CONVERT_BIN).toBe("convert2");
    expect(cfg.SCAN_EXCLUDE_BACKENDS).toEqual(["v4l", "net"]);
    expect(cfg.SCAN_PREFER_BACKENDS).toEqual(["fujitsu", "canon"]);
  });
});

