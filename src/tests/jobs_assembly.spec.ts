import { promises as fs } from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startScanJob } from "../services/jobs.js";
import { SaneBackend } from "../services/backends/sane.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";

// Real-path (non-mock) job where the scanner works but tiffcp fails.
vi.mock("execa", () => ({
  execa: vi.fn(async (bin: string, _args: string[], opts?: { cwd?: string }) => {
    if (bin === "scanimage") {
      for (const i of [1, 2]) {
        await fs.writeFile(path.join(opts!.cwd!, `page_${String(i).padStart(4, "0")}.tiff`), `PAGE_${i}`);
      }
      return { stdout: "", stderr: "" };
    }
    throw Object.assign(new Error("tiffcp failed"), {
      shortMessage: "Command failed with exit code 1: tiffcp",
      exitCode: 1,
      signal: undefined,
      stderr: "TIFFOpen: bad file",
    });
  }),
}));

const tmpRoot = path.resolve(__dirname, "..", ".tmp-tests-assembly");

const config: AppConfig = {
  SCAN_MOCK: false,
  INBOX_DIR: tmpRoot,
  LOG_LEVEL: "silent",
  SCAN_EXCLUDE_BACKENDS: [],
  SCAN_PREFER_BACKENDS: [],
  SCANIMAGE_BIN: "scanimage",
  TIFFCP_BIN: "tiffcp",
  IM_CONVERT_BIN: "convert",
  PERSIST_LAST_USED_DEVICE: false,
};
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
const ctx: AppContext = { config, logger, backend: new SaneBackend() };

beforeAll(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
});

afterAll(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

describe("document assembly failure (real path)", () => {
  it("records document_assembly_failed and puts the job in error instead of copying page 1", async () => {
    const res = await startScanJob({ device_id: "test:0", tmp_dir: tmpRoot }, ctx);
    expect(res.state).toBe("error");

    const manifest = JSON.parse(await fs.readFile(path.join(res.run_dir, "manifest.json"), "utf8"));
    expect(manifest.state).toBe("error");
    expect(manifest.documents).toEqual([]);
    await expect(fs.access(path.join(res.run_dir, "doc_0001.tiff"))).rejects.toThrow();

    const events = (await fs.readFile(path.join(res.run_dir, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const failed = events.find((e) => e.type === "document_assembly_failed");
    expect(failed?.data.exitCode).toBe(1);
    expect(failed?.data.stderrTail).toContain("bad file");
    expect(events.some((e) => e.type === "job_error")).toBe(true);
    expect(events.some((e) => e.type === "job_completed")).toBe(false);
  });
});
