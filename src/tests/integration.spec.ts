import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../services/jobs.js";
import { type AppConfig } from "../config.js";

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
  };

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
    const { job_id, run_dir, state } = await startScanJob({}, config);

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
    const status = await getJobStatus(job_id, config);
    expect(status.job_id).toBe(job_id);
    expect(status.state).toBe("completed");
    expect(status.pages).toBe(manifest.pages.length);
    expect(status.documents).toBe(manifest.documents.length);
  });

  it("should cancel a job and reflect the status", async () => {
    const { job_id } = await startScanJob({}, config);

    const cancelResult = await cancelJob(job_id, config);
    expect(cancelResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 100)); // Add a small delay

    const status = await getJobStatus(job_id, config);
    expect(status.state).toBe("cancelled");
  });

  it("should list multiple jobs", async () => {
    await startScanJob({}, config);
    await startScanJob({}, config);
    await startScanJob({}, config);

    const jobs = await listJobs(config, {});
    expect(jobs.length).toBeGreaterThanOrEqual(3);

    // Verify job states are correct
    const completedJobs = jobs.filter(job => job.state === "completed");
    expect(completedJobs.length).toBeGreaterThanOrEqual(3);
  });
});
