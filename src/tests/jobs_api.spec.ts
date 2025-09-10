import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../services/jobs.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";

const tmpInboxDir = path.resolve(__dirname, ".tmp-inbox-jobs-api");

// Mock execa globally for all tests in this file
vi.mock('execa', () => ({
  execa: vi.fn(() => Promise.resolve({
    stdout: '', stderr: '', exitCode: 0, command: '', failed: false, timedOut: false, isCanceled: false, killed: false
  })),
}));

describe("jobs api", () => {
  const config: AppConfig = {
    SCAN_MOCK: true,
    INBOX_DIR: tmpInboxDir,
    LOG_LEVEL: "silent",
    SCAN_EXCLUDE_BACKENDS: [],
    SCAN_PREFER_BACKENDS: [],
    SCANIMAGE_BIN: "scanimage",
    TIFFCP_BIN: "tiffcp",
    IM_CONVERT_BIN: "convert",
    PERSIST_LAST_USED_DEVICE: true,
  };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
  const ctx: AppContext = { config, logger };

  beforeAll(() => {
    fs.mkdirSync(tmpInboxDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpInboxDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    // Clear the inbox directory before each test
    if (fs.existsSync(tmpInboxDir)) {
      fs.rmSync(tmpInboxDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpInboxDir, { recursive: true });
  });

  it("should get job status", async () => {
    const { job_id } = await startScanJob({}, ctx);
    const status = await getJobStatus(job_id, ctx);
    expect(status.job_id).toBe(job_id);
    expect(status.state).toBe("completed");
  });

  it("should cancel a job", async () => {
    const { job_id } = await startScanJob({}, ctx);
    const result = await cancelJob(job_id, ctx);
    expect(result.ok).toBe(true);
    const status = await getJobStatus(job_id, ctx);
    expect(status.state).toBe("cancelled");
  });

  it("should list jobs", async () => {
    await startScanJob({}, ctx);
    await startScanJob({}, ctx);
    const jobs = await listJobs(ctx, {});
    expect(jobs).toHaveLength(2);
  });

  it("rejects malicious job_id", async () => {
    await expect(getJobStatus("../etc/passwd", ctx)).rejects.toThrow();
    await expect(cancelJob("../etc/passwd", ctx)).rejects.toThrow();
  });
});
