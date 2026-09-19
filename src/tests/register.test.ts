import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
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
  PERSIST_LAST_USED_DEVICE: false,
};

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

describe("registerScanServer", () => {
  let server: McpServer;
  let client: Client;
  let inboxDir: string;

  beforeEach(async () => {
    inboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-register-"));
    const ctx: AppContext = { config: { ...baseConfig, INBOX_DIR: inboxDir }, logger };
    server = new McpServer({ name: "scan-mcp", version });
    registerScanServer(server, ctx);
    client = new Client({ name: "scan-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    try {
      await client?.close();
      await server?.close();
    } finally {
      if (inboxDir) await fs.rm(inboxDir, { recursive: true, force: true });
    }
  });

  it("registers expected tools and resources", async () => {
    const [tools, templates, resources, prompts] = await Promise.all([
      client.listTools(),
      client.listResourceTemplates(),
      client.listResources(),
      client.listPrompts(),
    ]);
    expect(tools.tools.map((tool) => tool.name)).toEqual(
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
    expect(templates.resourceTemplates.map((template) => template.name)).toEqual(
      expect.arrayContaining(["manifest", "events"])
    );
    expect(resources.resources.map((resource) => resource.uri)).toContain("mcp://scan-mcp/orientation");
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain("bootstrap_context");
  });

  it("serves orientation text when the resource is read", async () => {
    const uri = "mcp://scan-mcp/orientation";
    const result = await client.readResource({ uri });
    const expectedText = await fs.readFile(path.resolve(__dirname, "../../resources/ORIENTATION.md"), "utf8");
    expect(result.contents).toEqual([{ uri, mimeType: "text/markdown", text: expectedText }]);
  });

  it("get_manifest reports missing file as error", async () => {
    const result = CallToolResultSchema.parse(await client.callTool({
      name: "get_manifest",
      arguments: { job_id: "job-00000000-0000-0000-0000-000000000000" },
    }));
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify({ error: "manifest not found" }) }]);
  });

  it("start_scan_job accepts crop_carrier_sheets: true and null", async () => {
    for (const cropCarrierSheets of [true, null]) {
      const result = CallToolResultSchema.parse(await client.callTool({
        name: "start_scan_job",
        arguments: { crop_carrier_sheets: cropCarrierSheets },
      }));
      expect(result.isError).not.toBe(true);
      const content = result.content[0];
      if (content.type !== "text") throw new Error("expected a text tool result");
      expect(JSON.parse(content.text).state).toBe("completed");
    }
  });

  it("get_manifest rejects malicious job_id", async () => {
    const result = CallToolResultSchema.parse(await client.callTool({
      name: "get_manifest",
      arguments: { job_id: "../etc/passwd" },
    }));
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "invalid job_id" }]);
  });
});
