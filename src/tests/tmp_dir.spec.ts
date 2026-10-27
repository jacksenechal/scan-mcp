import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Logger } from "pino";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerScanServer } from "../server/register.js";
import type { AppContext } from "../context.js";
import { ConfigSchema } from "../config.js";
import { MockBackend } from "../services/backends/mock.js";
import { startScanJob } from "../services/jobs.js";
import { version } from "../mcp.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

let root: string;
let inbox: string;
let outside: string;
let ctx: AppContext;
let server: McpServer;
let client: Client;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-tmpdir-"));
  inbox = path.join(root, "inbox");
  outside = path.join(root, "outside");
  await fs.mkdir(inbox);
  await fs.mkdir(outside);
  ctx = { logger, backend: new MockBackend(), config: ConfigSchema.parse({ SCAN_MOCK: true, INBOX_DIR: inbox, PERSIST_LAST_USED_DEVICE: false }) };
  server = new McpServer({ name: "scan-mcp", version });
  registerScanServer(server, ctx);
  client = new Client({ name: "scan-mcp-test", version: "1.0.0" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await client.close();
  await server.close();
  await fs.rm(root, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown>) {
  const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  const content = result.content[0];
  if (content.type !== "text") throw new Error("expected text result");
  return { isError: result.isError === true, text: content.text };
}

describe("start_scan_job tmp_dir containment", () => {
  it("rejects an absolute path outside the inbox without creating anything", async () => {
    const target = path.join(outside, "jobs");
    await expect(startScanJob({ tmp_dir: target }, ctx)).rejects.toThrow(/inside INBOX_DIR/);
    await expect(fs.access(target)).rejects.toThrow();
    const r = await call("start_scan_job", { tmp_dir: target });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/inside INBOX_DIR/);
  });

  it("rejects a .. escape", async () => {
    await expect(startScanJob({ tmp_dir: "../outside/jobs" }, ctx)).rejects.toThrow(/inside INBOX_DIR/);
    await expect(startScanJob({ tmp_dir: "sub/../../outside" }, ctx)).rejects.toThrow(/inside INBOX_DIR/);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it("rejects a sibling directory sharing the inbox name prefix", async () => {
    await expect(startScanJob({ tmp_dir: `${inbox}-evil` }, ctx)).rejects.toThrow(/inside INBOX_DIR/);
  });

  it("rejects a symlink inside the inbox that points outside", async () => {
    await fs.symlink(outside, path.join(inbox, "link"));
    await expect(startScanJob({ tmp_dir: "link" }, ctx)).rejects.toThrow(/symlink escape/);
    await expect(startScanJob({ tmp_dir: "link/deeper/still" }, ctx)).rejects.toThrow(/symlink escape/);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it("rejects a dangling symlink inside the inbox", async () => {
    await fs.symlink(path.join(outside, "missing"), path.join(inbox, "dangling"));
    await expect(startScanJob({ tmp_dir: "dangling" }, ctx)).rejects.toThrow(/dangling symlink/);
    await expect(fs.access(path.join(outside, "missing"))).rejects.toThrow();
  });

  it("creates the job under INBOX_DIR/<subdir> for a relative path", async () => {
    const job = await startScanJob({ tmp_dir: "batch/a" }, ctx);
    expect(job.state).toBe("completed");
    expect(path.dirname(job.run_dir)).toBe(path.join(inbox, "batch", "a"));
    expect(path.basename(job.run_dir)).toMatch(/^job-[0-9a-f-]{36}$/);
    await fs.access(path.join(job.run_dir, "manifest.json"));
  });

  it("accepts an absolute path inside the inbox", async () => {
    const job = await startScanJob({ tmp_dir: path.join(inbox, "abs") }, ctx);
    expect(path.dirname(job.run_dir)).toBe(path.join(inbox, "abs"));
  });

  it("accepts a symlink inside the inbox that stays inside it", async () => {
    await fs.mkdir(path.join(inbox, "real"));
    await fs.symlink(path.join(inbox, "real"), path.join(inbox, "alias"));
    const job = await startScanJob({ tmp_dir: "alias" }, ctx);
    await fs.access(path.join(inbox, "real", path.basename(job.run_dir), "manifest.json"));
  });
});

describe("job lookups with tmp_dir", () => {
  it("every lookup tool finds a tmp_dir job when given the same tmp_dir, and not without it", async () => {
    const started = await call("start_scan_job", { tmp_dir: "batch" });
    expect(started.isError).toBe(false);
    const { job_id } = JSON.parse(started.text);

    for (const name of ["get_job_status", "get_manifest", "get_events"]) {
      expect((await call(name, { job_id, tmp_dir: "batch" })).isError, name).toBe(false);
    }
    expect(JSON.parse((await call("get_job_status", { job_id })).text).state).toBe("unknown");
    expect((await call("get_manifest", { job_id })).isError).toBe(true);
    expect((await call("get_events", { job_id })).isError).toBe(true);
    expect(JSON.parse((await call("get_job_status", { job_id, tmp_dir: "batch" })).text)).toMatchObject({ job_id, state: "completed" });
    expect(JSON.parse((await call("get_manifest", { job_id, tmp_dir: "batch" })).text).job_id).toBe(job_id);

    // A completed job cannot be cancelled, but the lookup must reach it to say so.
    expect((await call("cancel_job", { job_id, tmp_dir: "batch" })).text).toContain("job is already completed");
    expect((await call("cancel_job", { job_id })).text).toContain("manifest not found");
  });

  it("rejects an escaping tmp_dir on every lookup tool", async () => {
    const job_id = "job-00000000-0000-0000-0000-000000000000";
    for (const name of ["get_job_status", "cancel_job", "get_manifest", "get_events"]) {
      const r = await call(name, { job_id, tmp_dir: outside });
      expect(r.isError, name).toBe(true);
      expect(r.text, name).toMatch(/inside INBOX_DIR/);
    }
    expect((await call("list_jobs", { tmp_dir: "../outside" })).isError).toBe(true);
  });

  it("list_jobs with tmp_dir lists only jobs there", async () => {
    const inInbox = await startScanJob({}, ctx);
    const inSub = await startScanJob({ tmp_dir: "batch" }, ctx);
    const sub = JSON.parse((await call("list_jobs", { tmp_dir: "batch" })).text).jobs;
    expect(sub.map((j: { job_id: string }) => j.job_id)).toEqual([inSub.job_id]);
    const top = JSON.parse((await call("list_jobs", {})).text).jobs;
    expect(top.map((j: { job_id: string }) => j.job_id)).toEqual([inInbox.job_id]);
  });

  it("cancel_job with tmp_dir cancels a running tmp_dir job", async () => {
    let entered!: (jobId: string) => void;
    const ready = new Promise<string>((resolve) => { entered = resolve; });
    vi.spyOn(ctx.backend, "runScan").mockImplementationOnce(async ({ runDir, signal }) => {
      entered(path.basename(runDir));
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
      signal.throwIfAborted();
      return { ran: true };
    });
    const pending = call("start_scan_job", { device_id: "test", tmp_dir: "batch" });
    const job_id = await ready;
    expect(JSON.parse((await call("get_job_status", { job_id, tmp_dir: "batch" })).text).state).toBe("running");
    expect(JSON.parse((await call("cancel_job", { job_id, tmp_dir: "batch" })).text)).toEqual({ ok: true });
    expect(JSON.parse((await pending).text).state).toBe("cancelled");
    expect(JSON.parse((await call("get_job_status", { job_id, tmp_dir: "batch" })).text).state).toBe("cancelled");
  });
});
