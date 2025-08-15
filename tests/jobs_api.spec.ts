import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../src/services/jobs";
import { loadConfig } from "../src/config";

const tmpInboxDir = path.resolve(__dirname, ".tmp-inbox-jobs-api");

describe("jobs api", () => {
  const config = loadConfig();

  beforeAll(() => {
    process.env.SCAN_MOCK = "1"; // Set SCAN_MOCK to true
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

  it("should get job status", async () => {
    const { job_id } = await startScanJob({});
    const status = await getJobStatus(job_id);
    expect(status.job_id).toBe(job_id);
    expect(status.state).toBe("completed");
  });

  it("should cancel a job", async () => {
    const { job_id } = await startScanJob({});
    const result = await cancelJob(job_id);
    expect(result.ok).toBe(true);
    const status = await getJobStatus(job_id);
    expect(status.state).toBe("cancelled");
  });

  it("should list jobs", async () => {
    await startScanJob({});
    await startScanJob({});
    const jobs = await listJobs({});
    expect(jobs).toHaveLength(2);
  });
});
