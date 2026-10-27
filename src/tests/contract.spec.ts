import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "pino";
import { registerScanServer } from "../server/register.js";
import { MockBackend } from "../services/backends/mock.js";
import { startScanJob } from "../services/jobs.js";
import { ManifestSchema } from "../services/manifest.js";
import type { AppConfig } from "../config.js";
import type { AppContext } from "../context.js";

// zod is the single source of truth for the tool contract; these tests pin what
// clients see in tools/list and the shape of manifest.json on disk.

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

type JsonSchema = {
  type?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  [k: string]: unknown;
};

let inboxDir: string;
let ctx: AppContext;
let server: McpServer;
let client: Client;

beforeAll(async () => {
  inboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-contract-"));
  const config: AppConfig = {
    SCAN_MOCK: true,
    INBOX_DIR: inboxDir,
    LOG_LEVEL: "silent",
    SCAN_EXCLUDE_BACKENDS: [],
    SCAN_PREFER_BACKENDS: [],
    SCANIMAGE_BIN: "scanimage",
    TIFFCP_BIN: "tiffcp",
    IM_CONVERT_BIN: "convert",
    PERSIST_LAST_USED_DEVICE: false,
  };
  ctx = { config, logger, backend: new MockBackend() };
  server = new McpServer({ name: "scan-mcp", version: "0.0.0-test" });
  registerScanServer(server, ctx);
  client = new Client({ name: "contract-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  await server?.close();
  await fs.rm(inboxDir, { recursive: true, force: true });
});

describe("tools/list contract", () => {
  async function inputSchema(tool: string): Promise<JsonSchema> {
    const { tools } = await client.listTools();
    const found = tools.find((t) => t.name === tool);
    expect(found, `tool ${tool} is published`).toBeDefined();
    return found!.inputSchema as JsonSchema;
  }

  it("publishes the expected tool names", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["cancel_job", "get_device_options", "get_events", "get_job_status", "get_manifest", "list_devices", "list_jobs", "start_scan_job"].sort()
    );
  });

  it("start_scan_job publishes its properties and enums", async () => {
    const props = (await inputSchema("start_scan_job")).properties!;
    expect(Object.keys(props).sort()).toEqual(
      [
        "color_mode", "crop_carrier_sheets", "custom_size_mm", "device_id", "doc_break_policy",
        "duplex", "output_format", "page_size", "resolution_dpi", "source", "tmp_dir",
      ].sort()
    );
    expect(props.source.enum).toEqual(["Flatbed", "ADF", "ADF Duplex"]);
    expect(props.page_size.enum).toEqual(["Letter", "A4", "Legal", "Custom"]);
    expect(props.doc_break_policy.properties!.type.enum).toEqual(["page_count", "none"]);
    expect(Object.keys(props.doc_break_policy.properties!).sort()).toEqual(["page_count", "type"]);
    expect(props.resolution_dpi.type).toBe("integer");
    expect(props.duplex.type).toBe("boolean");
    expect(props.crop_carrier_sheets.type).toBe("boolean");
  });

  it("start_scan_job publishes numeric bounds", async () => {
    const props = (await inputSchema("start_scan_job")).properties!;
    expect(props.resolution_dpi).toMatchObject({ type: "integer", exclusiveMinimum: 0 });
    expect(props.resolution_dpi).not.toHaveProperty("maximum");
    const size = props.custom_size_mm.properties!;
    expect(size.width).toMatchObject({ type: "number", minimum: 1 });
    expect(size.height).toMatchObject({ type: "number", minimum: 1 });
    expect(props.doc_break_policy.properties!.page_count).toMatchObject({ type: "integer", minimum: 1 });
  });

  it.each([
    ["resolution_dpi of 0", { resolution_dpi: 0 }],
    ["negative resolution_dpi", { resolution_dpi: -300 }],
    ["custom_size_mm under 1", { custom_size_mm: { width: 0.5, height: 100 } }],
    ["page_count of 0", { doc_break_policy: { type: "page_count", page_count: 0 } }],
  ])("start_scan_job rejects %s", async (_label, args) => {
    const before = await fs.readdir(inboxDir);
    const res = await client.callTool({ name: "start_scan_job", arguments: { tmp_dir: inboxDir, ...args } }).catch((e) => ({ isError: true, e }));
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(await fs.readdir(inboxDir)).toEqual(before);
  });

  it("start_scan_job accepts a large resolution_dpi and leaves it to the device", async () => {
    const res = await client.callTool({ name: "start_scan_job", arguments: { tmp_dir: inboxDir, resolution_dpi: 4800 } });
    expect((res as { isError?: boolean }).isError).toBeFalsy();
  });

  it("job tools require job_id and accept an optional tmp_dir", async () => {
    for (const tool of ["get_job_status", "cancel_job", "get_manifest", "get_events"]) {
      const schema = await inputSchema(tool);
      expect(Object.keys(schema.properties!)).toEqual(["job_id", "tmp_dir"]);
      expect(schema.required).toEqual(["job_id"]);
    }
  });
});

describe("manifest.json contract", () => {
  it("a mock job writes a manifest that parses with ManifestSchema", async () => {
    const res = await startScanJob({ tmp_dir: inboxDir }, ctx);
    const raw = JSON.parse(await fs.readFile(path.join(res.run_dir, "manifest.json"), "utf8"));
    const manifest = ManifestSchema.parse(raw);
    expect(manifest.job_id).toBe(res.job_id);
    expect(manifest.state).toBe("completed");
    expect(manifest.pages.length).toBeGreaterThan(0);
    expect(manifest.documents.length).toBeGreaterThan(0);
  });

  it("rejects a manifest with an unknown state", () => {
    expect(() =>
      ManifestSchema.parse({ job_id: "j", device_id: null, created_at: "x", state: "bogus", params: {}, pages: [], documents: [] })
    ).toThrow();
  });
});
