import { promises as fs } from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startScanJob, getJobStatus, cancelJob } from "../services/jobs.js";
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
};
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
const ctx: AppContext = { config, logger };

beforeAll(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
});

afterAll(async () => {
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {}
});

describe("startScanJob (mock)", () => {
  it("creates run dir with pages, doc, and manifest", async () => {
    const res = await startScanJob({ tmp_dir: tmpRoot }, ctx);
    expect(res.job_id).toMatch(/^job-/);

    await fs.access(res.run_dir);
    const manifestPath = path.join(res.run_dir, "manifest.json");
    const eventsPath = path.join(res.run_dir, "events.jsonl");
    await fs.access(manifestPath);
    await fs.access(eventsPath);
    const files = await fs.readdir(res.run_dir);
    expect(files.some((f) => f.startsWith("page_") && f.endsWith(".tiff"))).toBe(true);
    expect(files.some((f) => f.startsWith("doc_") && f.endsWith(".tiff"))).toBe(true);

    const status = await getJobStatus(res.job_id, ctx, tmpRoot);
    expect(status.pages).toBeGreaterThan(0);

    const cancel = await cancelJob(res.job_id, ctx, tmpRoot);
    expect(cancel.ok).toBe(true);
  });
});

