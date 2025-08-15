import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../src/services/jobs";
import { loadConfig } from "../src/config";

const tmpInboxDir = path.resolve(__dirname, ".tmp-inbox-integration");

describe("integration tests", () => {
  const config = loadConfig();

  beforeAll(() => {
    process.env.SCAN_MOCK = "1"; // Use mock scanner for integration tests
    process.env.INBOX_DIR = tmpInboxDir; // Set INBOX_DIR to a temporary path
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
    const { job_id, run_dir, state } = await startScanJob({});

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
    const status = await getJobStatus(job_id);
    expect(status.job_id).toBe(job_id);
    expect(status.state).toBe("completed");
    expect(status.pages).toBe(manifest.pages.length);
    expect(status.documents).toBe(manifest.documents.length);
  });

  it("should cancel a job and reflect the status", async () => {
    const { job_id } = await startScanJob({});

    const cancelResult = await cancelJob(job_id);
    expect(cancelResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 100)); // Add a small delay

    const status = await getJobStatus(job_id);
    expect(status.state).toBe("cancelled");
  });

  it("should list multiple jobs", async () => {
    await startScanJob({});
    await startScanJob({});
    await startScanJob({});

    const jobs = await listJobs({});
    expect(jobs.length).toBeGreaterThanOrEqual(3);

    // Verify job states are correct
    const completedJobs = jobs.filter(job => job.state === "completed");
    expect(completedJobs.length).toBeGreaterThanOrEqual(3);
  });
});
