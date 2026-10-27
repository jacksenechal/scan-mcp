import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Logger } from "pino";
import type { AppContext } from "../context.js";
import { ConfigSchema } from "../config.js";
import { MockBackend } from "../services/backends/mock.js";
import { SaneBackend } from "../services/backends/sane.js";
import { startScanJob, cancelJob, DeviceBusyError } from "../services/jobs.js";

// Per-device locking, driven by the fake scanimage in
// fixtures/sane-scanner.mjs. Device "wait" blocks until terminated; "success" completes.
let dir: string;
let ctx: AppContext;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
const scannerBin = path.resolve(__dirname, "fixtures/sane-scanner.mjs");

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-concurrency-"));
  ctx = {
    logger,
    backend: new SaneBackend(),
    config: ConfigSchema.parse({
      INBOX_DIR: path.join(dir, "inbox"), SCANIMAGE_BIN: scannerBin, TIFFCP_BIN: "cp", IM_CONVERT_BIN: "false",
    }),
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Resolves with the run dir and scanner pid once the fixture scanner of the only job is running.
async function scannerRunning(inbox = ctx.config.INBOX_DIR): Promise<{ runDir: string; pid: number }> {
  let found: { runDir: string; pid: number } | undefined;
  await vi.waitFor(async () => {
    const [jobId] = await fs.readdir(inbox);
    const runDir = path.join(inbox, jobId);
    found = { runDir, pid: Number(await fs.readFile(path.join(runDir, "scanner-started"), "utf8")) };
  }, { timeout: 5000 });
  return found!;
}

describe("per-device lock", () => {
  it("rejects a second job on a busy device without creating a job, while another device works", async () => {
    const first = startScanJob({ device_id: "wait" }, ctx);
    const { runDir, pid } = await scannerRunning();

    const err = await startScanJob({ device_id: "wait" }, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(DeviceBusyError);
    expect(err.message).toBe(`device wait is busy with job ${path.basename(runDir)}`);
    expect(await fs.readdir(ctx.config.INBOX_DIR)).toEqual([path.basename(runDir)]);

    const other = await startScanJob({ device_id: "success" }, ctx);
    expect(other.state).toBe("completed");

    expect(await cancelJob(path.basename(runDir), ctx)).toEqual({ ok: true });
    expect((await first).state).toBe("cancelled");
    expect(isAlive(pid)).toBe(false);
  });

  it("does not let auto-selection fall through to a different device", async () => {
    vi.spyOn(ctx.backend, "listDevices").mockResolvedValue([{ id: "wait" }, { id: "success" }]);
    vi.spyOn(ctx.backend, "getDeviceOptions").mockImplementation(async (id) =>
      id === "wait" ? { sources: ["ADF Duplex"] } : { sources: ["Flatbed"] });
    const first = startScanJob({ device_id: "wait" }, ctx);
    const { runDir } = await scannerRunning();
    // "wait" scores highest (ADF Duplex), is busy, and must not be swapped for "success".
    await expect(startScanJob({}, ctx)).rejects.toBeInstanceOf(DeviceBusyError);
    expect(await fs.readdir(ctx.config.INBOX_DIR)).toHaveLength(1);
    await cancelJob(path.basename(runDir), ctx);
    await first;
  });

  it("guards the default device when none is resolved", async () => {
    const mock: AppContext = { ...ctx, backend: new MockBackend() };
    vi.spyOn(mock.backend, "listDevices").mockResolvedValue([]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    vi.spyOn(mock.backend, "runScan").mockImplementation(async () => { started(); await gate; return { ran: true }; });
    const first = startScanJob({}, mock);
    await running;
    await expect(startScanJob({}, mock)).rejects.toThrow(/default scanner\) is busy/);
    release();
    await first;
  });

  it.each(["completed", "error", "cancelled"] as const)("is released when a job ends %s", async (state) => {
    const mock: AppContext = { ...ctx, backend: new MockBackend() };
    vi.spyOn(mock.backend, "runScan").mockImplementation(async ({ runDir, signal }) => {
      if (state === "error") throw new Error("paper jam");
      if (state === "cancelled") { await cancelJob(path.basename(runDir), mock); signal.throwIfAborted(); }
      return { ran: false };
    });
    if (state === "completed") vi.mocked(mock.backend.runScan).mockRestore();
    expect((await startScanJob({ device_id: "test" }, mock)).state).toBe(state);
    vi.restoreAllMocks();
    expect((await startScanJob({ device_id: "test" }, mock)).state).toBe("completed");
  });

  it("is released when tmp_dir validation or the post-mkdir check fails", async () => {
    await expect(startScanJob({ device_id: "success", tmp_dir: "/elsewhere" }, ctx)).rejects.toThrow(/inside INBOX_DIR/);
    // The post-mkdir realpath check fails after the lock is held: the job dir is swapped for a link out of the inbox.
    const outside = path.join(dir, "outside");
    await fs.mkdir(outside);
    vi.spyOn(fs, "mkdir").mockImplementationOnce(async (target, options) => {
      await fs.rm(String(target), { recursive: true, force: true });
      await fs.symlink(outside, String(target));
      return undefined as never;
    });
    await expect(startScanJob({ device_id: "success" }, ctx)).rejects.toThrow(/symlink escape|outside/);
    vi.restoreAllMocks();
    expect((await startScanJob({ device_id: "success" }, ctx)).state).toBe("completed");
  });

  it("is released when job setup fails", async () => {
    await fs.writeFile(ctx.config.INBOX_DIR, "not a directory");
    await expect(startScanJob({ device_id: "success" }, ctx)).rejects.toThrow();
    await fs.rm(ctx.config.INBOX_DIR);
    expect((await startScanJob({ device_id: "success" }, ctx)).state).toBe("completed");
  });
});
