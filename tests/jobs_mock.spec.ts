import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startScanJob, getJobStatus, cancelJob } from "../src/services/jobs";

const tmpRoot = path.resolve(__dirname, "..", ".tmp-tests");

beforeAll(() => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  process.env.SCAN_MOCK = "1"; // ensure mock path
});

afterAll(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}
});

describe("startScanJob (mock)", () => {
  it("creates run dir with pages, doc, and manifest", async () => {
    const res = await startScanJob({ tmp_dir: tmpRoot });
    expect(res.job_id).toMatch(/^job-/);
    expect(fs.existsSync(res.run_dir)).toBe(true);
    const manifestPath = path.join(res.run_dir, "manifest.json");
    const eventsPath = path.join(res.run_dir, "events.jsonl");
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(eventsPath)).toBe(true);
    const files = fs.readdirSync(res.run_dir);
    expect(files.some((f) => f.startsWith("page_") && f.endsWith(".tiff"))).toBe(true);
    expect(files.some((f) => f.startsWith("doc_") && f.endsWith(".tiff"))).toBe(true);

    const status = await getJobStatus(res.job_id, tmpRoot);
    expect(status.pages).toBeGreaterThan(0);

    const cancel = await cancelJob(res.job_id, tmpRoot);
    expect(cancel.ok).toBe(true);
  });
});

