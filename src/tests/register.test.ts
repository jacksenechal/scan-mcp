import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerScanServer } from "../server/register.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";
import type { Logger } from "pino";
import { version } from "../mcp.js";

const baseConfig: AppConfig = {
  SCAN_MOCK: true,
  INBOX_DIR: "/tmp/inbox",
  LOG_LEVEL: "silent",
  SCAN_EXCLUDE_BACKENDS: [],
  SCAN_PREFER_BACKENDS: [],
  SCANIMAGE_BIN: "scanimage",
  TIFFCP_BIN: "tiffcp",
  IM_CONVERT_BIN: "convert",
};

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;
const ctx: AppContext = { config: baseConfig, logger };

describe("registerScanServer", () => {
  it("registers expected tools and resources", () => {
    const server = new McpServer({ name: "scan-mcp", version }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, ctx);
    const internal = server as unknown as {
      _registeredTools: Record<string, unknown>;
      _registeredResourceTemplates: Record<string, unknown>;
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
  });

  it("get_manifest reports missing file as error", async () => {
    const server = new McpServer({ name: "scan-mcp", version }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, ctx);
    const internal = server as unknown as {
      _registeredTools: Record<string, { callback: (args: unknown) => Promise<{ isError?: boolean; content: { type: string }[] }> }>;
    };
    const tool = internal._registeredTools["get_manifest"];
    const result = await tool.callback({ job_id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
  });
});

