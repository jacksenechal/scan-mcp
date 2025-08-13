import { fileURLToPath } from "url";
import path from "path";
import pino from "pino";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { listDevices, getDeviceOptions } from "./services/sane.js";
import { startScanJob, getJobStatus, cancelJob, type StartScanInput } from "./services/jobs.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });

export async function main() {
  const server = new McpServer(
    { name: "scan-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  // Tool registrations (MCP high-level API with Zod schemas)
  server.tool("/scan/list_devices", async () => ({
    content: [{ type: "text", text: JSON.stringify(await listDevices()) }],
  }));

  server.tool("/scan/get_device_options", { device_id: z.string() }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await getDeviceOptions(args.device_id)) }],
  }));

  const StartScanInputShape = {
    device_id: z.string().optional(),
    resolution_dpi: z.number().int().optional(),
    color_mode: z.enum(["Color", "Gray", "Lineart"]).optional(),
    source: z.enum(["Flatbed", "ADF", "ADF Duplex"]).optional(),
    duplex: z.boolean().optional(),
    page_size: z.enum(["Letter", "A4", "Legal", "Custom"]).optional(),
    custom_size_mm: z.object({ width: z.number(), height: z.number() }).optional(),
    doc_break_policy: z
      .object({
        type: z.enum(["blank_page", "page_count", "timer", "barcode", "none"]).optional(),
        blank_threshold: z.number().optional(),
        page_count: z.number().int().optional(),
        timer_ms: z.number().int().optional(),
        barcode_values: z.array(z.string()).optional(),
      })
      .optional(),
    output_format: z.string().optional(),
    tmp_dir: z.string().optional(),
  } as const;

  server.tool("/scan/start_scan_job", StartScanInputShape, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await startScanJob(args as unknown as StartScanInput)) }],
  }));

  server.tool("/scan/get_job_status", { job_id: z.string() }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await getJobStatus(args.job_id)) }],
  }));

  server.tool("/scan/cancel_job", { job_id: z.string() }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await cancelJob(args.job_id)) }],
  }));

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
