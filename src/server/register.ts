import fs from "fs";
import path from "path";
import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { listDevices, getDeviceOptions } from "../services/sane.js";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../services/jobs.js";

export function registerScanServer(server: McpServer, config: AppConfig) {
  // Tools
  server.tool(
    "/scan/list_devices",
    "List connected scanner devices with basic capabilities",
    {},
    async () => ({ content: [{ type: "text", text: JSON.stringify({ devices: await listDevices(config) }) }] })
  );

  const GetDeviceOptionsShape = z.object({ device_id: z.string() });
  server.tool(
    "/scan/get_device_options",
    "Get SANE options for a specific device (sources, resolutions, modes)",
    GetDeviceOptionsShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getDeviceOptions(GetDeviceOptionsShape.parse(args).device_id, config)) }] })
  );

  const StartScanInputShape = z.object({
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
  });

  server.tool(
    "/scan/start_scan_job",
    "Start a scan job; auto-selects device and fills defaults when omitted",
    StartScanInputShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await startScanJob(StartScanInputShape.parse(args), config)) }] })
  );

  const JobIdShape = z.object({ job_id: z.string() });
  server.tool(
    "/scan/get_job_status",
    "Get status and artifact counts for a job",
    JobIdShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getJobStatus(JobIdShape.parse(args).job_id, config)) }] })
  );

  server.tool(
    "/scan/cancel_job",
    "Cancel a running scan job",
    JobIdShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await cancelJob(JobIdShape.parse(args).job_id, config)) }] })
  );

  const ListJobsInput = z.object({ limit: z.number().int().positive().max(100).optional(), state: z.enum(["running", "completed", "cancelled", "error", "unknown"]).optional() });
  server.tool(
    "/scan/list_jobs",
    "List recent scan jobs from the inbox directory",
    ListJobsInput.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify({ jobs: await listJobs(config, ListJobsInput.parse(args)) }) }] })
  );

  // Resources
  const manifestTemplate = new ResourceTemplate("scan://jobs/{job_id}/manifest", { list: undefined });
  server.resource(
    "/scan/resources/manifest",
    manifestTemplate,
    async (_uri, variables) => {
      const jobId = z.string().parse(variables.job_id);
      const runDir = path.join(path.resolve(config.INBOX_DIR), jobId);
      const p = path.join(runDir, "manifest.json");
      const txt = fsSafeRead(p);
      if (txt) return { contents: [{ uri: `file://${p}`, text: txt }] };
      return { contents: [], isError: true };
    }
  );

  const eventsTemplate = new ResourceTemplate("scan://jobs/{job_id}/events", { list: undefined });
  server.resource(
    "/scan/resources/events",
    eventsTemplate,
    async (_uri, variables) => {
      const jobId = z.string().parse(variables.job_id);
      const runDir = path.join(path.resolve(config.INBOX_DIR), jobId);
      const p = path.join(runDir, "events.jsonl");
      const txt = fsSafeRead(p);
      if (txt) return { contents: [{ uri: `file://${p}`, text: txt }] };
      return { contents: [], isError: true };
    }
  );
}

function fsSafeRead(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

