import { fileURLToPath } from "url";
import path from "path";
import pino from "pino";
import { Server } from "@modelcontextprotocol/sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/node";
import { loadConfig } from "./config.js";
import { listDevices, getDeviceOptions } from "./services/sane.js";
import { startScanJob, getJobStatus, cancelJob, type StartScanInput } from "./services/jobs.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });

export async function main() {
  const server = new Server(
    { name: "scan-mcp", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Tool registrations
  server.tool("/scan/list_devices", {
    description: "List available SANE devices",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "array" },
    handler: async () => listDevices(),
  });

  const asRecord = (input: unknown): Record<string, unknown> => (input ?? {}) as Record<string, unknown>;

  server.tool("/scan/get_device_options", {
    description: "Get options for a device via scanimage -A",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { device_id: { type: "string" } },
      required: ["device_id"],
    },
    handler: async (input: unknown) => {
      const rec = asRecord(input);
      return getDeviceOptions(String(rec.device_id ?? ""));
    },
  });

  server.tool("/scan/start_scan_job", {
    description: "Start a scanning job (ADF/duplex/page-size aware)",
    inputSchema: { type: "object" },
    handler: async (input: unknown) => startScanJob(input as StartScanInput),
  });

  server.tool("/scan/get_job_status", {
    description: "Get status and artifact counts for a job",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    handler: async (input: unknown) => {
      const rec = asRecord(input);
      return getJobStatus(String(rec.job_id ?? ""));
    },
  });

  server.tool("/scan/cancel_job", {
    description: "Cancel a job (mark manifest state)",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    handler: async (input: unknown) => {
      const rec = asRecord(input);
      return cancelJob(String(rec.job_id ?? ""));
    },
  });

  // Resources can be added later using server.resource(...) once SDK is present.

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isMain = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return path.resolve(process.argv[1] || "") === thisFile;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    logger.error({ err }, "scan-mcp MCP server error");
    process.exit(1);
  });
}
