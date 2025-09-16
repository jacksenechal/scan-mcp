import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "fs";
import os from "os";
import path from "path";
import type { AppConfig } from "../config.js";
import { detectMissingDependencies, ensureEnvironmentReady, PreflightError } from "../preflight.js";

describe("preflight checks", () => {
  let originalPath: string | undefined;
  let tempDirs: string[];

  beforeEach(() => {
    originalPath = process.env.PATH;
    tempDirs = [];
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
    return {
      LOG_LEVEL: "silent",
      INBOX_DIR: "/tmp/inbox",
      SCAN_MOCK: false,
      SCANIMAGE_BIN: "scanimage",
      TIFFCP_BIN: "tiffcp",
      IM_CONVERT_BIN: "convert",
      SCAN_EXCLUDE_BACKENDS: ["v4l"],
      SCAN_PREFER_BACKENDS: [],
      PERSIST_LAST_USED_DEVICE: true,
      ...overrides,
    };
  }

  function setupFakeCommands(names: string[]): void {
    const dir = mkdtempSync(path.join(os.tmpdir(), "scan-mcp-preflight-"));
    tempDirs.push(dir);
    for (const name of names) {
      const filePath = path.join(dir, name);
      writeFileSync(filePath, "#!/bin/sh\nexit 0\n");
      try {
        chmodSync(filePath, 0o755);
      } catch {
        // Ignore chmod failures on platforms that do not support it
      }
    }
    const existingPath = originalPath ? `${dir}${path.delimiter}${originalPath}` : dir;
    process.env.PATH = existingPath;
  }

  it("reports all required dependencies when PATH is empty", () => {
    delete process.env.PATH;
    const commandAvailable = vi.fn().mockReturnValue(false);
    const missing = detectMissingDependencies(makeConfig(), { commandAvailable });
    expect(commandAvailable).toHaveBeenCalled();
    expect(missing.map((m) => m.envVar).sort()).toEqual([
      "IM_CONVERT_BIN",
      "SCANIMAGE_BIN",
      "TIFFCP_BIN",
    ]);
  });

  it("passes when fake commands are available", () => {
    setupFakeCommands(["scanimage", "tiffcp", "convert"]);
    const missing = detectMissingDependencies(makeConfig());
    expect(missing).toEqual([]);
  });

  it("throws a PreflightError when Node is too old", () => {
    setupFakeCommands(["scanimage", "tiffcp", "convert"]);
    expect(() =>
      ensureEnvironmentReady({
        nodeVersion: "v21.8.0",
        config: makeConfig(),
      })
    ).toThrow(PreflightError);
  });

  it("completes successfully when Node and dependencies are satisfied", () => {
    setupFakeCommands(["scanimage", "tiffcp", "convert"]);
    expect(() =>
      ensureEnvironmentReady({
        nodeVersion: "v22.0.0",
        config: makeConfig(),
      })
    ).not.toThrow();
  });
});
