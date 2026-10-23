import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { ConfigSchema, type AppConfig } from "../config.js";
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

  it("rejects instead of substituting the first page when tiffcp fails", async () => {
    const ctx = makeCtx({ TIFFCP_BIN: "false" });
    const page1 = path.join(dir, "page_0001.tiff");
    const page2 = path.join(dir, "page_0002.tiff");
    const out = path.join(dir, "doc_0001.tiff");
    await fs.writeFile(page1, "one");
    await fs.writeFile(page2, "two");
    await expect(ctx.backend.assembleTiff([page1, page2], out, ctx, new AbortController().signal)).rejects.toThrow();
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

describe("SaneBackend subprocess cancellation", () => {
  let dir: string;
  let controller: AbortController;
  let ctx: AppContext;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-sane cancel-"));
    controller = new AbortController();
    ctx = {
      logger,
      backend: new SaneBackend(),
      config: ConfigSchema.parse({ INBOX_DIR: dir, SCANIMAGE_BIN: path.resolve(__dirname, "fixtures/sane-scanner.mjs") }),
    };
  });
  afterEach(async () => {
    controller.abort();
    await fs.rm(dir, { recursive: true, force: true });
  });

  // The fixture's behavior is selected by the device id: success | failure | wait | stubborn.
  function scan(mode = "success", onEvent: (event: BackendEvent) => Promise<void> = async () => {}) {
    return ctx.backend.runScan({ input: { device_id: mode }, runDir: dir, ctx, signal: controller.signal, onEvent });
  }

  it("never starts a scanner with a pre-aborted signal", async () => {
    controller.abort();
    const onEvent = vi.fn();
    expect(await scan("success", onEvent)).toEqual({ ran: false });
    expect(onEvent).not.toHaveBeenCalled();
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("does not spawn when cancellation arrives during event persistence", async () => {
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const pending = scan("success", async (event) => {
      if (event.type === "scanner_exec") { entered(); await blocked; }
    });
    try {
      await ready;
      controller.abort();
    } finally { release(); }
    expect(await pending).toEqual({ ran: false });
    await expect(fs.access(path.join(dir, "scanner-started"))).rejects.toThrow();
    await expect(fs.access(path.join(dir, "page_0001.tiff"))).rejects.toThrow();
  });

  it.each(["wait", "stubborn"])("terminates and reaps a %s scanner before returning", async (mode) => {
    const pending = scan(mode);
    let pid = 0;
    try {
      await vi.waitFor(async () => {
        pid = Number(await fs.readFile(path.join(dir, "scanner-started"), "utf8"));
        expect(pid).toBeGreaterThan(0);
      }, { timeout: 3000 });
    } finally { controller.abort(); await pending; }
    expect(await pending).toEqual({ ran: false });
    expect(await fs.readFile(path.join(dir, "scanner-stopped"), "utf8")).toBe("SIGTERM");
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("captures a page normally", async () => {
    expect(await scan()).toEqual({ ran: true });
    expect(await fs.readFile(path.join(dir, "page_0001.tiff"), "utf8")).toBe("PAGE_1");
  });

  it("reports scanner exit failures", async () => {
    const events: BackendEvent[] = [];
    expect(await scan("failure", async (event) => { events.push(event); })).toEqual({ ran: false });
    expect(events).toContainEqual(expect.objectContaining({ type: "scanner_failed", data: expect.objectContaining({ exitCode: 2 }) }));
  });
});
