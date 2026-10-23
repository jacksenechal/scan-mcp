import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Logger } from "pino";
import type { AppContext } from "../context.js";
import { ConfigSchema, type AppConfig } from "../config.js";
import { SaneBackend } from "../services/backends/sane.js";
import { startScanJob, getJobStatus } from "../services/jobs.js";

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

  it("ends as error, keeping the raw pages, when tiffcp fails", async () => {
    const ctx = makeCtx({ TIFFCP_BIN: "false" });
    const job = await startScanJob({ device_id: "success" }, ctx);
    expect(job.state).toBe("error");
    expect(await getJobStatus(job.job_id, ctx)).toMatchObject({ state: "error", pages: 1, documents: 0 });
    expect(await fs.readFile(path.join(job.run_dir, "page_0001.tiff"), "utf8")).toBe("PAGE_1");
    await expect(fs.access(path.join(job.run_dir, "doc_0001.tiff"))).rejects.toThrow();
    expect((await events(job.run_dir)).map((e) => e.type)).toContain("job_error");
  });
});
