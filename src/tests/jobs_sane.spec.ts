import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import crypto from "crypto";
import os from "os";
import path from "path";
import type { Logger } from "pino";
import type { AppContext } from "../context.js";
import { ConfigSchema, type AppConfig } from "../config.js";
import { SaneBackend } from "../services/backends/sane.js";
import { startScanJob, cancelJob, getJobStatus } from "../services/jobs.js";

// End-to-end job tests driven by the fake scanimage in fixtures/sane-scanner.mjs, whose
// behavior is selected by device_id.
let dir: string;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

function makeCtx(overrides: Partial<AppConfig> = {}): AppContext {
  const config = ConfigSchema.parse({
    INBOX_DIR: path.join(dir, "inbox"),
    SCANIMAGE_BIN: path.resolve(__dirname, "fixtures/sane-scanner.mjs"),
    // Carrier detection is best-effort; keep it from invoking the real ImageMagick.
    IM_CONVERT_BIN: "false",
    ...overrides,
  });
  return { config, logger, backend: new SaneBackend() };
}

async function events(runDir: string): Promise<{ type: string; data?: Record<string, unknown> }[]> {
  const raw = await fs.readFile(path.join(runDir, "events.jsonl"), "utf8");
  return raw.trim().split("\n").map((line) => JSON.parse(line));
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-jobs-sane-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("SANE job outcomes", () => {
  it("completes a scan with a document", async () => {
    // cp stands in for tiffcp: it is a valid assembler for a single page.
    const ctx = makeCtx({ TIFFCP_BIN: "cp" });
    const job = await startScanJob({ device_id: "success" }, ctx);
    expect(job.state).toBe("completed");
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ pages: 1, documents: 1 });
  });

  it.each([
    ["the default document policy", undefined],
    ["a page_count policy", { type: "page_count" as const, page_count: 2 }],
  ])("ends as error when the scanner produces no pages (%s)", async (_label, doc_break_policy) => {
    const ctx = makeCtx();
    const job = await startScanJob({ device_id: "empty", doc_break_policy }, ctx);
    expect(job.state).toBe("error");
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state: "error", pages: 0, documents: 0 });
    const failed = (await events(job.run_dir)).find((e) => e.type === "job_error");
    expect(failed?.data?.reason).toContain("Scanner produced no pages");
  });

  it("keeps finished pages when the scan fails midway", async () => {
    const ctx = makeCtx();
    const job = await startScanJob({ device_id: "page-fail" }, ctx);
    expect(job.state).toBe("error");
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ pages: 1, documents: 0 });
  });

  it("keeps finished pages, and drops the in-progress one, when cancelled", async () => {
    const ctx = makeCtx();
    const pending = startScanJob({ device_id: "page-wait" }, ctx);
    // The fixture writes scanner-started once page 1 is complete and page 2 is under way.
    let runDir = "";
    await vi.waitFor(async () => {
      const [jobId] = await fs.readdir(ctx.config.INBOX_DIR);
      runDir = path.join(ctx.config.INBOX_DIR, jobId);
      await fs.access(path.join(runDir, "scanner-started"));
    }, { timeout: 3000 });
    expect(await cancelJob(path.basename(runDir), ctx)).toEqual({ ok: true });
    const job = await pending;
    expect(job.state).toBe("cancelled");
    const manifest = JSON.parse(await fs.readFile(path.join(runDir, "manifest.json"), "utf8"));
    expect(manifest.pages).toEqual([
      {
        index: 1,
        path: path.join(runDir, "page_0001.tiff"),
        sha256: crypto.createHash("sha256").update("PAGE_1").digest("hex"),
      },
    ]);
    expect(manifest.documents).toEqual([]);
    expect((await fs.readdir(runDir)).filter((f) => f.endsWith(".part"))).toEqual([]);
    expect((await events(runDir)).map((e) => e.type)).toEqual([
      "job_started", "scanner_exec", "page_scanned", "job_cancelled",
    ]);
  });
});
