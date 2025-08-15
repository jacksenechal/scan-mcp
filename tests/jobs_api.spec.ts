import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../src/services/jobs";
import { loadConfig } from "../src/config";

describe("jobs api", () => {
  const config = loadConfig();
  config.SCAN_MOCK = true; // Set SCAN_MOCK to true

  beforeEach(() => {
    // Clear the inbox directory before each test
    const inboxDir = path.resolve(config.INBOX_DIR);
    if (fs.existsSync(inboxDir)) {
      fs.rmSync(inboxDir, { recursive: true, force: true });
    }
    fs.mkdirSync(inboxDir, { recursive: true });
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
