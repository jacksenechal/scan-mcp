import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import { SaneBackend } from "../services/backends/sane.js";
import type { BackendEvent } from "../services/backends/backend.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

function makeCtx(overrides: Partial<AppConfig>): AppContext {
  const config: AppConfig = {
    SCAN_MOCK: false,
    INBOX_DIR: "/tmp",
    LOG_LEVEL: "silent",
    SCAN_EXCLUDE_BACKENDS: [],
    SCAN_PREFER_BACKENDS: [],
    SCANIMAGE_BIN: "scanimage",
    TIFFCP_BIN: "tiffcp",
    IM_CONVERT_BIN: "convert",
    PERSIST_LAST_USED_DEVICE: false,
    ...overrides,
  };
  return { config, logger, backend: new SaneBackend() };
}

describe("SaneBackend", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-sane-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("propagates a tiffcp failure instead of substituting a page", async () => {
    const ctx = makeCtx({ TIFFCP_BIN: "false" });
    const page1 = path.join(dir, "page_0001.tiff");
    const page2 = path.join(dir, "page_0002.tiff");
    const out = path.join(dir, "doc_0001.tiff");
    await fs.writeFile(page1, "one");
    await fs.writeFile(page2, "two");
    await expect(ctx.backend.assembleTiff([page1, page2], out, ctx)).rejects.toThrow(/false/);
    await expect(fs.access(out)).rejects.toThrow();
  });

  it("reports scanner_failed and ran=false when scanimage fails", async () => {
    const ctx = makeCtx({ SCANIMAGE_BIN: "false" });
    const events: BackendEvent[] = [];
    const res = await ctx.backend.runScan({
      input: {},
      runDir: dir,
      ctx,
      signal: new AbortController().signal,
      onEvent: async (e) => {
        events.push(e);
      },
    });
    expect(res.ran).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["scanner_exec", "scanner_failed"]);
  });
});
