import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { Logger } from "pino";
import type { AppContext } from "../context.js";
import { ConfigSchema } from "../config.js";
import { MockBackend } from "../services/backends/mock.js";
import { startScanJob, cancelJob, getJobStatus } from "../services/jobs.js";

let dir: string;
let ctx: AppContext;
const logger = { debug: vi.fn(), error: vi.fn() } as unknown as Logger;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-cancel-"));
  ctx = { logger, backend: new MockBackend(), config: ConfigSchema.parse({
    SCAN_MOCK: true, INBOX_DIR: path.join(dir, "runs", "inbox"), PERSIST_LAST_USED_DEVICE: true,
  }) };
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(dir, { recursive: true, force: true }); });

function blockWrite(matches: (file: string, data: string) => boolean) {
  let release!: () => void;
  let enter!: (file: string) => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<string>(resolve => { enter = resolve; });
  const write = fs.writeFile;
  vi.spyOn(fs, "writeFile").mockImplementation(async (file, data, options) => {
    if (matches(String(file), String(data))) { enter(String(file)); await blocked; }
    return write(file, data, options);
  });
  return { entered, release };
}
async function events(runDir: string): Promise<string[]> {
  return (await fs.readFile(path.join(runDir, "events.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line).type);
}

describe("job cancellation boundaries", () => {
  it.each(["cancelled", "error", "completed"] as const)("records confirmed pages when capture ends as %s", async state => {
    const contents = "CAPTURED_TIFF_PAGE";
    let runningStatus: Awaited<ReturnType<typeof getJobStatus>> | undefined;
    vi.spyOn(ctx.backend, "runScan").mockImplementation(async ({ runDir, onEvent, signal }) => {
      const pagePath = path.join(runDir, "page_0001.tiff");
      await fs.writeFile(pagePath, contents);
      await onEvent({ type: "page_scanned", index: 1, path: pagePath });
      runningStatus = await getJobStatus(path.basename(runDir), ctx);
      if (state === "cancelled") {
        await cancelJob(path.basename(runDir), ctx);
        signal.throwIfAborted();
      }
      if (state === "error") throw new Error("scanner disconnected after first page");
      return { ran: true };
    });
    const job = await startScanJob({ device_id: "test" }, ctx);
    expect(runningStatus).toMatchObject({ state: "running", pages: 1 });
    expect(job.state).toBe(state);
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state, pages: 1, documents: state === "completed" ? 1 : 0 });
    const manifest = JSON.parse(await fs.readFile(path.join(job.run_dir, "manifest.json"), "utf8"));
    expect(manifest.pages).toEqual([{
      index: 1, path: path.join(job.run_dir, "page_0001.tiff"),
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    }]);
    expect(await fs.readFile(manifest.pages[0].path, "utf8")).toBe(contents);
    expect((await events(job.run_dir)).filter(type => ["job_completed", "job_cancelled", "job_error"].includes(type))).toEqual(["job_" + state]);
  });

  it("honors cancellation while the initial manifest is being written", async () => {
    const gate = blockWrite((file, data) => file.endsWith("manifest.json") && JSON.parse(data).state === "running");
    const capture = vi.spyOn(ctx.backend, "runScan");
    const pending = startScanJob({ device_id: "test" }, ctx);
    try {
      const manifestPath = await gate.entered;
      expect(await cancelJob(path.basename(path.dirname(manifestPath)), ctx)).toEqual({ ok: true });
    } finally { gate.release(); await pending; }
    const job = await pending;
    expect(capture).not.toHaveBeenCalled();
    expect(job.state).toBe("cancelled");
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state: "cancelled", pages: 0, documents: 0 });
    expect(await events(job.run_dir)).toEqual(["job_started", "job_cancelled"]);
  });

  it("retains a confirmed page when cancelled during its manifest write", async () => {
    const gate = blockWrite((file, data) => file.endsWith("manifest.json") && JSON.parse(data).state === "running" && JSON.parse(data).pages.length === 1);
    vi.spyOn(ctx.backend, "runScan").mockImplementation(async ({ runDir, onEvent, signal }) => {
      const pagePath = path.join(runDir, "page_0001.tiff");
      await fs.writeFile(pagePath, "CAPTURED_PAGE");
      await fs.writeFile(path.join(runDir, "ica_scratch.tiff"), "UNFINISHED_PAGE");
      await onEvent({ type: "page_scanned", index: 1, path: pagePath });
      signal.throwIfAborted();
      return { ran: true };
    });
    const pending = startScanJob({ device_id: "test" }, ctx);
    try {
      const manifestPath = await gate.entered;
      expect(await cancelJob(path.basename(path.dirname(manifestPath)), ctx)).toEqual({ ok: true });
    } finally { gate.release(); await pending; }
    const job = await pending;
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state: "cancelled", pages: 1, documents: 0 });
    expect(await events(job.run_dir)).toEqual(["job_started", "page_scanned", "job_cancelled"]);
  });

  it("keeps cancellation terminal during final device persistence", async () => {
    const gate = blockWrite(file => file === path.join(dir, ".state", "scan-mcp.json"));
    const pending = startScanJob({ device_id: "test" }, ctx);
    try {
      await gate.entered;
      const [jobId] = await fs.readdir(ctx.config.INBOX_DIR);
      expect(await getJobStatus(jobId, ctx)).toMatchObject({ state: "running" });
      expect(await cancelJob(jobId, ctx)).toEqual({ ok: true });
      expect(await cancelJob(jobId, ctx)).toEqual({ ok: true });
    } finally { gate.release(); await pending; }
    const job = await pending;
    expect(job.state).toBe("cancelled");
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state: "cancelled", pages: 2, documents: 1 });
    expect((await events(job.run_dir)).filter(type => ["job_completed", "job_cancelled", "job_error"].includes(type))).toEqual(["job_cancelled"]);
    expect(await fs.readFile(path.join(job.run_dir, "page_0001.tiff"), "utf8")).toBe("MOCK_TIFF_PAGE_1");
  });

  it("rejects cancellation once completion is committed, including while its manifest is pending", async () => {
    const gate = blockWrite((file, data) => file.endsWith("manifest.json") && JSON.parse(data).state === "completed");
    const pending = startScanJob({ device_id: "test" }, ctx);
    try {
      const manifestPath = await gate.entered;
      expect(await cancelJob(path.basename(path.dirname(manifestPath)), ctx)).toEqual({ ok: false, error: "job is already completed" });
    } finally { gate.release(); await pending; }
    const job = await pending;
    const before = await fs.readFile(path.join(job.run_dir, "manifest.json"), "utf8");
    expect(await cancelJob(job.job_id, ctx)).toEqual({ ok: false, error: "job is already completed" });
    expect(await fs.readFile(path.join(job.run_dir, "manifest.json"), "utf8")).toBe(before);
    expect((await events(job.run_dir)).filter(type => type.startsWith("job_") && type !== "job_started")).toEqual(["job_completed"]);
  });

  it("does not rewrite failed jobs as cancelled", async () => {
    vi.spyOn(ctx.backend, "runScan").mockRejectedValue(new Error("paper jam"));
    const job = await startScanJob({ device_id: "test" }, ctx);
    expect(job.state).toBe("error");
    expect(await cancelJob(job.job_id, ctx)).toEqual({ ok: false, error: "job is already error" });
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state: "error" });
    expect(await events(job.run_dir)).toEqual(["job_started", "job_error"]);
  });

  it.each(["error", "cancelled"] as const)("preserves a %s outcome while its manifest is pending", async state => {
    const gate = blockWrite((file, data) => file.endsWith("manifest.json") && JSON.parse(data).state === state);
    vi.spyOn(ctx.backend, "runScan").mockImplementation(async ({ runDir }) => {
      if (state === "cancelled") await cancelJob(path.basename(runDir), ctx);
      throw new Error("scan stopped");
    });
    const pending = startScanJob({ device_id: "test" }, ctx);
    try {
      const manifestPath = await gate.entered;
      expect(await cancelJob(path.basename(path.dirname(manifestPath)), ctx)).toEqual(state === "cancelled" ? { ok: true } : { ok: false, error: "job is already error" });
    } finally { gate.release(); await pending; }
    const job = await pending;
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state });
    expect(await events(job.run_dir)).toEqual(["job_started", "job_" + state]);
  });

  it("can cancel a running manifest left by a previous server process", async () => {
    const jobId = "job-00000000-0000-0000-0000-000000000000";
    const runDir = path.join(ctx.config.INBOX_DIR, jobId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, "manifest.json"), JSON.stringify({ job_id: jobId, state: "running", pages: [], documents: [] }));
    expect(await cancelJob(jobId, ctx)).toEqual({ ok: true });
    expect(await cancelJob(jobId, ctx)).toEqual({ ok: true });
    expect(await getJobStatus(jobId, ctx)).toMatchObject({ state: "cancelled" });
    expect(await events(runDir)).toEqual(["job_cancelled"]);
  });

  it("makes repeated cancellation idempotent after a cancelled job finishes", async () => {
    vi.spyOn(ctx.backend, "runScan").mockImplementation(async ({ runDir }) => {
      await cancelJob(path.basename(runDir), ctx);
      return { ran: false };
    });
    const job = await startScanJob({ device_id: "test" }, ctx);
    expect(job.state).toBe("cancelled");
    expect(await cancelJob(job.job_id, ctx)).toEqual({ ok: true });
    expect(await cancelJob(job.job_id, ctx)).toEqual({ ok: true });
    expect(await events(job.run_dir)).toEqual(["job_started", "job_cancelled"]);
  });

  it("reports an unknown job without creating its manifest", async () => {
    expect(await cancelJob("job-00000000-0000-0000-0000-000000000000", ctx)).toEqual({ ok: false, error: "manifest not found" });
  });
});
