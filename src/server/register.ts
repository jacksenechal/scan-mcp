import fs from "fs";
import path from "path";
import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { listDevices, getDeviceOptions } from "../services/sane.js";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../services/jobs.js";

export function registerScanServer(server: McpServer, config: AppConfig) {
  // Tools
  // No input schema so clients may omit params entirely
  server.tool(
    "list_devices",
    "List connected scanner devices with basic capabilities",
    async () => ({ content: [{ type: "text", text: JSON.stringify({ devices: await listDevices(config) }) }] })
  );

  const GetDeviceOptionsShape = z.object({ device_id: z.string() });
  server.tool(
    "get_device_options",
    "Get SANE options for a specific device (sources, resolutions, modes)",
    GetDeviceOptionsShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getDeviceOptions(GetDeviceOptionsShape.parse(args).device_id, config)) }] })
  );

  const nullToUndef = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === null ? undefined : v), schema.optional());

  const StartScanInputShape = z.object({
    device_id: nullToUndef(z.string()),
    resolution_dpi: nullToUndef(z.number().int()),
    // Allow any string; devices may expose Halftone, Binary, Gray16, etc.
    color_mode: nullToUndef(z.string()),
    source: nullToUndef(z.enum(["Flatbed", "ADF", "ADF Duplex"])),
    duplex: nullToUndef(z.boolean()),
    page_size: nullToUndef(z.enum(["Letter", "A4", "Legal", "Custom"])),
    custom_size_mm: nullToUndef(z.object({ width: z.number(), height: z.number() })),
    doc_break_policy: nullToUndef(
      z.object({
        type: nullToUndef(z.enum(["blank_page", "page_count", "timer", "barcode", "none"])),
        blank_threshold: nullToUndef(z.number()),
        page_count: nullToUndef(z.number().int()),
        timer_ms: nullToUndef(z.number().int()),
        barcode_values: nullToUndef(z.array(z.string())),
      })
    ),
    output_format: nullToUndef(z.string()),
    tmp_dir: nullToUndef(z.string()),
  });

  server.tool(
    "start_scan_job",
    "Start a scan job; auto-selects device and fills defaults when omitted",
    StartScanInputShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await startScanJob(StartScanInputShape.parse(args), config)) }] })
  );

  const JobIdShape = z.object({ job_id: z.string() });
  server.tool(
    "get_job_status",
    "Get status and artifact counts for a job",
    JobIdShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getJobStatus(JobIdShape.parse(args).job_id, config)) }] })
  );

  server.tool(
    "cancel_job",
    "Cancel a running scan job",
    JobIdShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await cancelJob(JobIdShape.parse(args).job_id, config)) }] })
  );

  const ListJobsInput = z.object({
    limit: nullToUndef(z.number().int().positive().max(100)),
    state: nullToUndef(z.enum(["running", "completed", "cancelled", "error", "unknown"]))
  });
  server.tool(
    "list_jobs",
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
