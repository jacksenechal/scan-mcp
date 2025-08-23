import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerScanServer } from "../server/register.js";
import type { AppConfig } from "../config.js";

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

describe("registerScanServer", () => {
  it("registers expected tools and resources", () => {
    const server = new McpServer({ name: "scan-mcp", version: "0.1.0" }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, baseConfig);
    const tools = Object.keys((server as any)._registeredTools);
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
    const resources = Object.keys((server as any)._registeredResourceTemplates);
    expect(resources).toEqual(expect.arrayContaining(["manifest", "events"]));
  });

  it("get_manifest reports missing file as error", async () => {
    const server = new McpServer({ name: "scan-mcp", version: "0.1.0" }, { capabilities: { tools: {}, resources: {} } });
    registerScanServer(server, baseConfig);
    const tool = (server as any)._registeredTools["get_manifest"];
    const result = await tool.callback({ job_id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
  });
});

