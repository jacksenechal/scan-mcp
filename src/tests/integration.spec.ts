import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../services/jobs.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";

const tmpInboxDir = path.resolve(__dirname, ".tmp-inbox-integration");

// Mock execa globally for all tests in this file
vi.mock('execa', () => ({
  execa: vi.fn(() => Promise.resolve({
    stdout: '', stderr: '', exitCode: 0, command: '', failed: false, timedOut: false, isCanceled: false, killed: false
  })),
}));

describe("integration tests", () => {
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

  it("should complete a full scan job workflow", async () => {
    const { job_id, run_dir, state } = await startScanJob({}, ctx);

    expect(job_id).toBeDefined();
    expect(run_dir).toBeDefined();
    expect(state).toBe("completed");

    // Verify manifest and events files exist
    const manifestPath = path.join(run_dir, "manifest.json");
    const eventsPath = path.join(run_dir, "events.jsonl");
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(eventsPath)).toBe(true);

    // Verify pages and documents are created
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.pages.length).toBeGreaterThan(0);
    expect(manifest.documents.length).toBeGreaterThan(0);

    // Verify job status
    const status = await getJobStatus(job_id, ctx);
    expect(status.job_id).toBe(job_id);
    expect(status.state).toBe("completed");
    expect(status.pages).toBe(manifest.pages.length);
    expect(status.documents).toBe(manifest.documents.length);
  });

  it("should cancel a job and reflect the status", async () => {
    const { job_id } = await startScanJob({}, ctx);

    const cancelResult = await cancelJob(job_id, ctx);
    expect(cancelResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 100)); // Add a small delay

    const status = await getJobStatus(job_id, ctx);
    expect(status.state).toBe("cancelled");
  });

  it("should list multiple jobs", async () => {
    await startScanJob({}, ctx);
    await startScanJob({}, ctx);
    await startScanJob({}, ctx);

    const jobs = await listJobs(ctx, {});
    expect(jobs.length).toBeGreaterThanOrEqual(3);

    // Verify job states are correct
    const completedJobs = jobs.filter(job => job.state === "completed");
    expect(completedJobs.length).toBeGreaterThanOrEqual(3);
  });
});
