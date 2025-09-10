import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../context.js";
import { listDevices, getDeviceOptions } from "../services/sane.js";
import { startScanJob, getJobStatus, cancelJob, listJobs } from "../services/jobs.js";
import { resolveJobPath } from "../services/utils.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const orientationPath = path.resolve(currentDir, "../../ORIENTATION.md");
const orientationUri = "mcp://scan-mcp/orientation";
const orientationText = await fs.readFile(orientationPath, "utf8");
const orientationLastModified = (await fs.stat(orientationPath)).mtime.toISOString();

export function registerScanServer(server: McpServer, ctx: AppContext) {

  // Tools
  // No input schema so clients may omit params entirely
  server.tool(
    "list_devices",
    "List connected scanner devices with basic capabilities",
    async () => ({ content: [{ type: "text", text: JSON.stringify({ devices: await listDevices(ctx) }) }] })
  );

  const GetDeviceOptionsShape = z.object({ device_id: z.string() });
  server.tool(
    "get_device_options",
    "Get SANE options for a specific device (sources, resolutions, modes)",
    GetDeviceOptionsShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getDeviceOptions(GetDeviceOptionsShape.parse(args).device_id, ctx)) }] })
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
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await startScanJob(StartScanInputShape.parse(args), ctx)) }] })
  );

  const JobIdShape = z.object({ job_id: z.string() });
  server.tool(
    "get_job_status",
    "Get status and artifact counts for a job",
    JobIdShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getJobStatus(JobIdShape.parse(args).job_id, ctx)) }] })
  );

  server.tool(
    "cancel_job",
    "Cancel a running scan job",
    JobIdShape.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify(await cancelJob(JobIdShape.parse(args).job_id, ctx)) }] })
  );

  const ListJobsInput = z.object({
    limit: nullToUndef(z.number().int().positive().max(100)),
    state: nullToUndef(z.enum(["running", "completed", "cancelled", "error", "unknown"]))
  });
  server.tool(
    "list_jobs",
    "List recent scan jobs from the inbox directory",
    ListJobsInput.shape,
    async (args) => ({ content: [{ type: "text", text: JSON.stringify({ jobs: await listJobs(ctx, ListJobsInput.parse(args)) }) }] })
  );

  // Resource mirrors via tools for agents that don't support MCP resources
  server.tool(
    "get_manifest",
    "Fetch a job manifest JSON by job_id",
    JobIdShape.shape,
    async (args) => {
      const jobId = z.string().parse(JobIdShape.parse(args).job_id);
      const runDir = resolveJobPath(jobId, ctx.config.INBOX_DIR);
      const p = path.join(runDir, "manifest.json");
      const txt = await fsSafeRead(p);
      if (txt) return { content: [{ type: "text", text: txt }] };
      return { content: [{ type: "text", text: JSON.stringify({ error: "manifest not found" }) }], isError: true };
    }
  );

  server.tool(
    "get_events",
    "Fetch job events JSONL by job_id",
    JobIdShape.shape,
    async (args) => {
      const jobId = z.string().parse(JobIdShape.parse(args).job_id);
      const runDir = resolveJobPath(jobId, ctx.config.INBOX_DIR);
      const p = path.join(runDir, "events.jsonl");
      const txt = await fsSafeRead(p);
      if (txt) return { content: [{ type: "text", text: txt }] };
      return { content: [{ type: "text", text: JSON.stringify({ error: "events not found" }) }], isError: true };
    }
  );

  server.tool(
    "Start Here for ScanServerOrientation",
    "Compatibility fallback: returns full orientation document; prefer resources and prompts",
    async () => ({
      content: [
        {
          type: "text",
          text: `URI: ${orientationUri}\n\n${orientationText}`,
        },
      ],
    })
  );

  server.prompt(
    "bootstrap_context",
    "Initialize Context",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Read the attached resources, then confirm readiness.",
          },
        },
        {
          role: "assistant",
          content: {
            type: "resource",
            resource: { uri: orientationUri, mimeType: "text/markdown", text: "" },
          },
        },
      ],
    })
  );

  // Resources
  server.resource(
    "orientation",
    orientationUri,
    {
      title: "scan-mcp Orientation",
      mimeType: "text/markdown",
      text: orientationText,
      annotations: {
        audience: ["assistant"],
        priority: 1.0,
        lastModified: orientationLastModified,
      },
    },
    async () => ({
      contents: [
        { uri: orientationUri, mimeType: "text/markdown", text: orientationText },
      ],
    })
  );

  const manifestTemplate = new ResourceTemplate("scan://jobs/{job_id}/manifest", { list: undefined });
  server.resource(
    "manifest",
    manifestTemplate,
    async (_uri, variables) => {
      const jobId = z.string().parse(variables.job_id);
      const runDir = resolveJobPath(jobId, ctx.config.INBOX_DIR);
      const p = path.join(runDir, "manifest.json");
      const txt = await fsSafeRead(p);
      if (txt) return { contents: [{ uri: `file://${p}`, text: txt }] };
      return { contents: [], isError: true };
    }
  );

const eventsTemplate = new ResourceTemplate("scan://jobs/{job_id}/events", { list: undefined });
  server.resource(
    "events",
    eventsTemplate,
    async (_uri, variables) => {
      const jobId = z.string().parse(variables.job_id);
      const runDir = resolveJobPath(jobId, ctx.config.INBOX_DIR);
      const p = path.join(runDir, "events.jsonl");
      const txt = await fsSafeRead(p);
      if (txt) return { contents: [{ uri: `file://${p}`, text: txt }] };
      return { contents: [], isError: true };
    }
  );
}

async function fsSafeRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}
