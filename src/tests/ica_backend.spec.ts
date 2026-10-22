import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Logger } from "pino";
import { ConfigSchema } from "../config.js";
import type { AppContext } from "../context.js";
import type { BackendEvent } from "../services/backends/backend.js";
import { IcaBackend } from "../services/backends/ica.js";
import { startScanJob, cancelJob, getJobStatus, resolveEffectiveInput } from "../services/jobs.js";

const helper = path.resolve(__dirname, "fixtures/ica-helper.mjs");
const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;
let dir: string;
let ctx: AppContext;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-ica test-"));
  ctx = {
    logger, backend: new IcaBackend(),
    config: ConfigSchema.parse({ INBOX_DIR: dir, MCP_SCANNER_HELPER_BIN: helper,
      PERSIST_LAST_USED_DEVICE: false, IM_CONVERT_BIN: "/missing-imagemagick" }),
  };
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

function scan(deviceId = "test", onEvent: (event: BackendEvent) => Promise<void> = async () => {}, signal = new AbortController().signal) {
  return ctx.backend.runScan({ input: { device_id: deviceId }, runDir: dir, ctx, onEvent, signal });
}

describe("ICA subprocess contract", () => {
  it("discovers devices and reads source-specific options", async () => {
    expect(await ctx.backend.listDevices(ctx)).toEqual([{ id: "test", vendor: "Test", model: "Scanner" }]);
    expect((await ctx.backend.getDeviceOptions("test", ctx)).per_source?.ADF.resolutions).toEqual([200, 300]);
  });

  it("drains page callbacks, UTF-8 chunks, and the last unterminated line", async () => {
    const events: BackendEvent[] = [];
    const result = await scan("test", async event => {
      await new Promise(resolve => setTimeout(resolve, 5));
      events.push(event);
    });
    expect(result.ran).toBe(true);
    expect(events.filter(e => e.type === "page_scanned")).toHaveLength(2);
    expect(events).toContainEqual({ type: "warning", message: "scanner prêt" });
  });

  it.each(["invalid-json", "helper-error", "exit-failure", "no-complete", "mismatch"])("rejects %s", async scenario => {
    await expect(scan(scenario)).rejects.toThrow();
  });

  it("propagates event-persistence failures", async () => {
    await expect(scan("test", async event => {
      if (event.type === "page_scanned") throw new Error("disk full");
    })).rejects.toThrow("disk full");
  });

  it("honors both pre-aborted and running cancellation", async () => {
    const already = new AbortController(); already.abort();
    const onEvent = vi.fn();
    await expect(scan("test", onEvent, already.signal)).rejects.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
    const running = new AbortController();
    await expect(scan("wait", async event => {
      if (event.type === "stage") running.abort();
    }, running.signal)).rejects.toThrow();
  });

  it("never launches the helper if cancelled during event persistence", async () => {
    const controller = new AbortController();
    const events: BackendEvent[] = [];
    await expect(scan("test", async event => {
      events.push(event);
      if (event.type === "scanner_exec") controller.abort();
    }, controller.signal)).rejects.toThrow();
    expect(events.map(event => event.type)).toEqual(["scanner_exec"]);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("rejects unsupported formats and custom dimensions before capture", async () => {
    for (const input of [{ output_format: "pdf" }, { page_size: "Custom" as const }, { custom_size_mm: { width: 10, height: 10 } }]) {
      const onEvent = vi.fn();
      await expect(ctx.backend.runScan({ input, runDir: dir, ctx, signal: new AbortController().signal, onEvent })).rejects.toThrow();
      expect(onEvent).not.toHaveBeenCalled();
    }
  });

  it("uses capabilities of the selected functional unit for defaults", async () => {
    vi.spyOn(ctx.backend, "getDeviceOptions").mockResolvedValue({ sources: ["Flatbed", "ADF"], resolutions: [300, 600], color_modes: ["Color"],
      per_source: { ADF: { resolutions: [200], color_modes: ["Gray"] } } });
    const resolved = await resolveEffectiveInput({ device_id: "test", source: "ADF" }, ctx);
    expect(resolved.resolution_dpi).toBe(200);
    expect(resolved.color_mode).toBe("Gray");
  });
});

describe("ICA job integration", () => {
  it("assembles both pages without tiffcp and preserves segmentation", async () => {
    const result = await startScanJob({ device_id: "test" }, ctx);
    expect(result.state).toBe("completed");
    const manifest = JSON.parse(await fs.readFile(path.join(result.run_dir, "manifest.json"), "utf8"));
    expect(manifest.documents[0].pages).toEqual([1, 2]);
    expect(await fs.readFile(manifest.documents[0].path, "utf8")).toBe("PAGE_1|PAGE_2");
    const split = await startScanJob({ device_id: "test", doc_break_policy: { type: "page_count", page_count: 1 } }, ctx);
    const splitManifest = JSON.parse(await fs.readFile(path.join(split.run_dir, "manifest.json"), "utf8"));
    expect(splitManifest.documents.map((d: { pages: number[] }) => d.pages)).toEqual([[1], [2]]);
  });

  it("persists an error instead of publishing a partial assembly", async () => {
    vi.spyOn(ctx.backend as IcaBackend, "assembleTiff").mockRejectedValue(new Error("assembler failed"));
    const result = await startScanJob({ device_id: "test" }, ctx);
    expect(result.state).toBe("error");
    expect(await getJobStatus(result.job_id, ctx)).toMatchObject({ state: "error", pages: 2, documents: 0 });
  });

  it("cancels and reaps the native assembler while preserving captured pages", async () => {
    const pending = startScanJob({ device_id: "assembly-wait", doc_break_policy: { type: "page_count", page_count: 1 } }, ctx);
    let jobId: string | undefined;
    let pid = 0;
    try {
      await vi.waitFor(async () => {
        [jobId] = await fs.readdir(dir);
        expect(jobId).toBeDefined();
        pid = Number(await fs.readFile(path.join(dir, jobId!, "doc_0001.tiff.pid"), "utf8"));
        expect(pid).toBeGreaterThan(0);
      }, { timeout: 3000 });
      expect(await cancelJob(jobId!, ctx)).toEqual({ ok: true });
    } finally {
      if (jobId) await cancelJob(jobId, ctx);
      await pending;
    }
    const result = await pending;
    expect(result.state).toBe("cancelled");
    expect(await getJobStatus(result.job_id, ctx)).toMatchObject({ state: "cancelled", pages: 2, documents: 0 });
    expect(() => process.kill(pid, 0)).toThrow();
    expect(await fs.readFile(path.join(result.run_dir, "page_0001.tiff"), "utf8")).toBe("WAIT_FOR_ASSEMBLY_ABORT");
    expect((await fs.readdir(result.run_dir)).filter(file => /^doc_.*\.tiff$/.test(file))).toEqual([]);
    const events = (await fs.readFile(path.join(result.run_dir, "events.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line).type);
    expect(events.filter(type => ["job_completed", "job_error", "job_cancelled"].includes(type))).toEqual(["job_cancelled"]);
  });

  it("keeps cancellation terminal and exposes a running manifest", async () => {
    let cancelled = false;
    vi.spyOn(ctx.backend, "runScan").mockImplementation(async ({ runDir, signal }) => {
      const jobId = path.basename(runDir);
      expect(await getJobStatus(jobId, ctx)).toMatchObject({ state: "running" });
      expect(await cancelJob(jobId, ctx)).toEqual({ ok: true });
      cancelled = signal.aborted;
      return { ran: true };
    });
    const result = await startScanJob({ device_id: "test" }, ctx);
    expect(cancelled).toBe(true);
    expect(result.state).toBe("cancelled");
    expect(await getJobStatus(result.job_id, ctx)).toMatchObject({ state: "cancelled" });
  });
});
