import { fileURLToPath } from "url";
import path from "path";
import pino from "pino";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { listDevices, getDeviceOptions } from "./services/sane.js";
import { startScanJob, getJobStatus, cancelJob, listJobs, type StartScanInput } from "./services/jobs.js";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });

export async function main() {
  const server = new McpServer(
    { name: "scan-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  // Common shapes
  const DeviceShape = {
    id: z.string(),
    vendor: z.string().optional(),
    model: z.string().optional(),
    saneName: z.string().optional(),
    capabilities: z
      .object({
        adf: z.boolean().optional(),
        duplex: z.boolean().optional(),
        color_modes: z.array(z.string()).optional(),
        resolutions: z.array(z.number()).optional(),
        page_sizes: z.array(z.string()).optional(),
      })
      .optional(),
  } as const;

  // Tools with input schemas and JSON text outputs
  server.tool(
    "/scan/list_devices",
    "List connected scanner devices with basic capabilities",
    {},
    async () => ({ content: [{ type: "text", text: JSON.stringify({ devices: await listDevices() }) }] })
  );

  const GetDeviceOptionsShape = { device_id: z.string() } as const;
  server.tool(
    "/scan/get_device_options",
    "Get SANE options for a specific device (sources, resolutions, modes)",
    GetDeviceOptionsShape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getDeviceOptions((args as any).device_id)) }] })
  );

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

  server.tool(
    "/scan/start_scan_job",
    "Start a scan job; auto-selects device and fills defaults when omitted",
    StartScanInputShape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await startScanJob(args as unknown as StartScanInput)) }] })
  );

  const JobIdShape = { job_id: z.string() } as const;
  server.tool(
    "/scan/get_job_status",
    "Get status and artifact counts for a job",
    JobIdShape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getJobStatus((args as any).job_id)) }] })
  );

  server.tool(
    "/scan/cancel_job",
    "Cancel a running scan job",
    JobIdShape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await cancelJob((args as any).job_id)) }] })
  );

  // List jobs tool
  const ListJobsInput = { limit: z.number().int().positive().max(100).optional(), state: z.enum(["running", "completed", "cancelled", "error", "unknown"]).optional() } as const;
  const JobItemShape = { job_id: z.string(), run_dir: z.string(), state: z.string(), created_at: z.string().optional(), pages: z.number().optional(), documents: z.number().optional() } as const;
  server.tool(
    "/scan/list_jobs",
    "List recent scan jobs from the inbox directory",
    ListJobsInput,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify({ jobs: await listJobs(args as any) }) }] })
  );

  // Resources: manifest and events per-job
  const manifestTemplate = new ResourceTemplate("scan://jobs/{job_id}/manifest", { list: undefined });
  server.resource(
    "/scan/resources/manifest",
    manifestTemplate,
    async (_uri, variables) => {
      const jobId = String((variables as any).job_id || "");
      const runDir = path.join(path.resolve(config.INBOX_DIR), jobId);
      const p = path.join(runDir, "manifest.json");
      const txt = fsSafeRead(p);
      return { content: [{ type: "text", text: txt ?? "manifest not found" }], isError: !txt } as any;
    }
  );

  const eventsTemplate = new ResourceTemplate("scan://jobs/{job_id}/events", { list: undefined });
  server.resource(
    "/scan/resources/events",
    eventsTemplate,
    async (_uri, variables) => {
      const jobId = String((variables as any).job_id || "");
      const runDir = path.join(path.resolve(config.INBOX_DIR), jobId);
      const p = path.join(runDir, "events.jsonl");
      const txt = fsSafeRead(p);
      return { content: [{ type: "text", text: txt ?? "events not found" }], isError: !txt } as any;
    }
  );

  function fsSafeRead(p: string): string | null {
    try {
      return require("fs").readFileSync(p, "utf8");
    } catch {
      return null;
    }
  }

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
