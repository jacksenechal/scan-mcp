import { describe, it, expect, vi, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerScanServer } from "../server/register.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";
import { version } from "../mcp.js";

const tmpCropDir = path.resolve(__dirname, ".tmp-register-crop-carrier");

const baseConfig: AppConfig = {
  SCAN_MOCK: true,
  INBOX_DIR: "/tmp/inbox",
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

afterAll(async () => {
  try {
    await fs.rm(tmpCropDir, { recursive: true, force: true });
  } catch {}
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
      ])
    );
    const resources = Object.keys(internal._registeredResourceTemplates);
    expect(resources).toEqual(expect.arrayContaining(["manifest", "events"]));
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

  it("start_scan_job accepts crop_carrier_sheets: true and null", async () => {
    // Use a dedicated INBOX_DIR (rather than tmp_dir on the input) so the
    // last-used-device state file lands under the test's own tmp dir instead
    // of the fixed baseConfig.INBOX_DIR (which may not be writable here).
    const cropCtx: AppContext = { config: { ...baseConfig, INBOX_DIR: tmpCropDir, PERSIST_LAST_USED_DEVICE: false }, logger };
    const server = new McpServer({ name: "scan-mcp", version }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, cropCtx);
    const internal = server as unknown as {
      _registeredTools: Record<string, { callback: (args: unknown) => Promise<{ content: { type: string; text: string }[] }> }>;
    };
    const tool = internal._registeredTools["start_scan_job"];

    const withTrue = await tool.callback({ crop_carrier_sheets: true });
    expect(JSON.parse(withTrue.content[0].text).state).toBe("completed");

    const withNull = await tool.callback({ crop_carrier_sheets: null });
    expect(JSON.parse(withNull.content[0].text).state).toBe("completed");
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
});
