import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerScanServer } from "../server/register.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";
import { version } from "../mcp.js";

const tmpInboxDir = path.resolve(__dirname, ".tmp-register-inbox");

const baseConfig: AppConfig = {
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
const ctx: AppContext = { config: baseConfig, logger };

beforeAll(() => {
  fs.mkdirSync(tmpInboxDir, { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(tmpInboxDir, { recursive: true, force: true });
  } catch {}
});

beforeEach(() => {
  if (fs.existsSync(tmpInboxDir)) {
    fs.rmSync(tmpInboxDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tmpInboxDir, { recursive: true });
});

describe("registerScanServer", () => {
  it("registers expected tools and resources", () => {
    const server = new McpServer({ name: "scan-mcp", version }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, ctx);
    const internal = server as unknown as {
      _registeredTools: Record<string, unknown>;
      _registeredResourceTemplates: Record<string, unknown>;
      _registeredResources: Record<string, unknown>;
      _registeredPrompts: Record<string, unknown>;
    };
    const tools = Object.keys(internal._registeredTools);
    expect(tools).toEqual(
      expect.arrayContaining([
        "list_devices",
        "get_device_options",
        "start_scan_job",
        "get_job_status",
        "cancel_job",
        "list_jobs",
        "get_manifest",
        "get_events",
        "Start Here for ScanServerOrientation",
      ])
    );
    const resources = Object.keys(internal._registeredResourceTemplates);
    expect(resources).toEqual(
      expect.arrayContaining(["manifest", "events", "job_page", "job_document"])
    );
    const staticResources = Object.keys(internal._registeredResources);
    expect(staticResources).toEqual(
      expect.arrayContaining(["mcp://scan-mcp/orientation"])
    );
    const prompts = Object.keys(internal._registeredPrompts);
    expect(prompts).toEqual(expect.arrayContaining(["bootstrap_context"]));
  });

  it("get_manifest reports missing file as error", async () => {
    const server = new McpServer({ name: "scan-mcp", version }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, ctx);
    const internal = server as unknown as {
      _registeredTools: Record<string, { callback: (args: unknown) => Promise<{ isError?: boolean; content: { type: string }[] }> }>;
    };
    const tool = internal._registeredTools["get_manifest"];
    const result = await tool.callback({ job_id: "job-00000000-0000-0000-0000-000000000000" });
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
  });

  it("get_manifest rejects malicious job_id", async () => {
    const server = new McpServer({ name: "scan-mcp", version: "0.1.0" }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, ctx);
    const internal = server as unknown as {
      _registeredTools: Record<string, { callback: (args: unknown) => Promise<unknown> }>;
    };
    const tool = internal._registeredTools["get_manifest"];
    await expect(tool.callback({ job_id: "../etc/passwd" })).rejects.toThrow();
  });

  it("serves page and document resources as blobs", async () => {
    const server = new McpServer({ name: "scan-mcp", version }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, ctx);
    const jobId = "job-00000000-0000-0000-0000-000000000123";
    const runDir = path.join(tmpInboxDir, jobId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "page_0001.tiff"), "PAGE1");
    fs.writeFileSync(path.join(runDir, "doc_0001.tiff"), "DOC1");

    const internal = server as unknown as {
      _registeredResourceTemplates: Record<string, { readCallback: (uri: URL, vars: Record<string, unknown>, extra: unknown) => Promise<{ contents: Array<{ blob?: string; mimeType?: string }>; isError?: boolean }> }>;
    };

    const pageCb = internal._registeredResourceTemplates["job_page"].readCallback;
    const pageResult = await pageCb(
      new URL(`mcp://scan-mcp/jobs/${jobId}/page/1`),
      { job_id: jobId, page_index: "1" },
      {}
    );
    expect(pageResult.contents[0].blob).toBe(Buffer.from("PAGE1").toString("base64"));
    expect(pageResult.contents[0].mimeType).toBe("image/tiff");

    const documentCb = internal._registeredResourceTemplates["job_document"].readCallback;
    const docResult = await documentCb(
      new URL(`mcp://scan-mcp/jobs/${jobId}/document/1`),
      { job_id: jobId, document_index: "1" },
      {}
    );
    expect(docResult.contents[0].blob).toBe(Buffer.from("DOC1").toString("base64"));
    expect(docResult.contents[0].mimeType).toBe("image/tiff");
  });
});
