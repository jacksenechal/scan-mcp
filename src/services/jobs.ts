import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { execa, type Subprocess } from "execa";
import { type AppConfig } from "../config.js";
import { MOCK_PAGE_COUNT, DEFAULT_RESOLUTION_DPI, LETTER_WIDTH_MM, LETTER_HEIGHT_MM, A4_WIDTH_MM, A4_HEIGHT_MM, LEGAL_WIDTH_MM, LEGAL_HEIGHT_MM } from "../constants.js";
import { selectDevice } from "./select.js";
import { getDeviceOptions } from "./sane.js";

const activeJobs = new Map<string, Subprocess>();

export type StartScanInput = {
  device_id?: string;
  resolution_dpi?: number;
  color_mode?: "Color" | "Gray" | "Lineart";
  source?: "Flatbed" | "ADF" | "ADF Duplex";
  duplex?: boolean;
  page_size?: "Letter" | "A4" | "Legal" | "Custom";
  custom_size_mm?: { width: number; height: number };
  doc_break_policy?: {
    type?: "blank_page" | "page_count" | "timer" | "barcode" | "none";
    blank_threshold?: number;
    page_count?: number;
    timer_ms?: number;
    barcode_values?: string[];
  };
  output_format?: string;
  tmp_dir?: string;
};

export type StartScanResult = {
  job_id: string;
  run_dir: string;
  state: "running" | "completed" | "cancelled" | "error";
};

type Manifest = {
  job_id: string;
  device_id: string | null;
  created_at: string;
  params: StartScanInput;
  pages: { index: number; path: string; sha256: string }[];
  documents: { index: number; pages: number[]; path: string; sha256: string }[];
  state: "running" | "completed" | "cancelled" | "error";
};

async function initializeJob(input: StartScanInput, config: AppConfig): Promise<{ runDir: string, manifest: Manifest, eventsPath: string }> {
  const effective = await resolveEffectiveInput(input, config);
  const id = `job-${uuidv4()}`;
  const baseDir = effective.tmp_dir ? path.resolve(effective.tmp_dir) : path.resolve(config.INBOX_DIR);
  const runDir = path.join(baseDir, id);
  fs.mkdirSync(runDir, { recursive: true });

  const eventsPath = path.join(runDir, "events.jsonl");
  const now = new Date().toISOString();

  const manifest: Manifest = {
    job_id: id,
    device_id: effective.device_id ?? null,
    created_at: now,
    params: effective,
    pages: [],
    documents: [],
    state: "running" as const,
  };

  appendEvent(eventsPath, { ts: now, type: "job_started", data: { input: effective } });

  return { runDir, manifest, eventsPath };
}

async function runScan(runDir: string, manifest: Manifest, eventsPath: string, config: AppConfig): Promise<boolean> {
  if (config.SCAN_MOCK) {
    // Create a couple of fake TIFFs to simulate capture
    const pageCount = MOCK_PAGE_COUNT;
    for (let i = 1; i <= pageCount; i++) {
      const p = path.join(runDir, `page_${String(i).padStart(4, "0")}.tiff`);
      fs.writeFileSync(p, `MOCK_TIFF_PAGE_${i}`);
    }
    return true;
  }

  // Real execution path
  const candidates = planScanCommands(manifest.params, runDir, config);
  let ran = false; // Initialize ran to false
  for (const c of candidates) {
    let outStream: fs.WriteStream | undefined
    let errStream: fs.WriteStream | undefined
    try {
      // Do not inherit stdio; pipe and persist logs to files to avoid polluting MCP stdout
      const proc = execa(c.bin, c.args, { cwd: runDir, shell: false });
      const outPath = path.join(runDir, "scanner.out.log");
      const errPath = path.join(runDir, "scanner.err.log");
      outStream = fs.createWriteStream(outPath, { flags: "a" });
      errStream = fs.createWriteStream(errPath, { flags: "a" });
      proc.stdout?.pipe(outStream);
      proc.stderr?.pipe(errStream);
      activeJobs.set(manifest.job_id, proc);
      await proc;
      ran = true;
      break;
    } catch (err) {
      appendEvent(eventsPath, { ts: new Date().toISOString(), type: "scanner_primary_failed", data: { bin: c.bin, args: c.args, err: String(err) } });
      continue;
    } finally {
      activeJobs.delete(manifest.job_id);
      try { outStream?.end(); } catch {}
      try { errStream?.end(); } catch {}
    }
  }
  return ran; // Return ran
}

async function processPages(runDir: string, manifest: Manifest, config: AppConfig) {
    const pages = fs
        .readdirSync(runDir)
        .filter((f) => f.startsWith("page_") && f.endsWith(".tiff"))
        .sort()
        .map((f, idx) => {
            const p = path.join(runDir, f);
            return { index: idx + 1, path: p, sha256: hashFile(p) };
        });
    manifest.pages.push(...pages);

    const segments = segmentPages(pages.map((p) => p.index), manifest.params.doc_break_policy);
    let docIdx = 1;
    for (const seg of segments) {
        const outDoc = path.join(runDir, `doc_${String(docIdx).padStart(4, "0")}.tiff`);
        const segFiles = seg.map((i) => pages[i - 1]?.path).filter(Boolean) as string[];
        await assembleTiff(segFiles, outDoc, config);
        manifest.documents.push({ index: docIdx, pages: seg, path: outDoc, sha256: hashFile(outDoc) });
        docIdx++;
    }
}

function updateManifest(runDir: string, manifest: Manifest) {
    const manifestPath = path.join(runDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function startScanJob(input: StartScanInput, config: AppConfig): Promise<StartScanResult> {
  const { runDir, manifest, eventsPath } = await initializeJob(input, config);

  const scanSuccessful = await runScan(runDir, manifest, eventsPath, config);

  if (!scanSuccessful) {
    manifest.state = "error";
    updateManifest(runDir, manifest);
    appendEvent(eventsPath, { ts: new Date().toISOString(), type: "job_error", data: { reason: "all candidates failed" } });
    return { job_id: manifest.job_id, run_dir: runDir, state: manifest.state };
  }

  await processPages(runDir, manifest, config);

  manifest.state = "completed";
  updateManifest(runDir, manifest);
  appendEvent(eventsPath, { ts: new Date().toISOString(), type: "job_completed" });
  if (manifest.device_id) saveLastUsedDevice(manifest.device_id, config);

  return { job_id: manifest.job_id, run_dir: runDir, state: manifest.state };
}

export async function getJobStatus(jobId: string, config: AppConfig, baseDir?: string) {
  const runDir = path.join(path.resolve(baseDir ?? config.INBOX_DIR), jobId);
  const manifestPath = path.join(runDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { job_id: jobId, state: "unknown", error: "manifest not found" } as const;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return {
    job_id: manifest.job_id,
    state: manifest.state,
    pages: manifest.pages?.length ?? 0,
    documents: manifest.documents?.length ?? 0,
    run_dir: runDir,
  };
}

export async function cancelJob(jobId: string, config: AppConfig, baseDir?: string) {
  const runDir = path.join(path.resolve(baseDir ?? config.INBOX_DIR), jobId);

  // Terminate the running process, if it exists
  if (activeJobs.has(jobId)) {
    activeJobs.get(jobId)?.kill("SIGTERM", new Error("MCP_CANCEL_REQUEST"));
    activeJobs.delete(jobId);
  }

  // Update the manifest to reflect the cancellation
  const manifestPath = path.join(runDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { ok: false, error: "manifest not found" } as const;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.state = "cancelled";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  appendEvent(path.join(runDir, "events.jsonl"), { ts: new Date().toISOString(), type: "job_cancelled" });
  return { ok: true } as const;
}

export type JobInfo = {
  job_id: string;
  run_dir: string;
  state: string;
  created_at?: string;
  pages?: number;
  documents?: number;
};

export async function listJobs(config: AppConfig, { limit, state }: { limit?: number; state?: string } = {}): Promise<JobInfo[]> {
  const base = path.resolve(config.INBOX_DIR);
  if (!fs.existsSync(base)) return [];
  const entries = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("job-"))
    .map((d) => ({ name: d.name, run_dir: path.join(base, d.name) }));

  const items: JobInfo[] = [];
  for (const e of entries) {
    const manifestPath = path.join(e.run_dir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        items.push({
          job_id: m.job_id || e.name,
          run_dir: e.run_dir,
          state: String(m.state || "unknown"),
          created_at: typeof m.created_at === "string" ? m.created_at : undefined,
          pages: Array.isArray(m.pages) ? m.pages.length : undefined,
          documents: Array.isArray(m.documents) ? m.documents.length : undefined,
        });
        continue;
      } catch {}
    }
    const st = fs.statSync(e.run_dir);
    items.push({ job_id: e.name, run_dir: e.run_dir, state: "unknown", created_at: new Date(st.mtimeMs).toISOString() });
  }

  items.sort((a, b) => {
    const at = a.created_at ? Date.parse(a.created_at) : 0;
    const bt = b.created_at ? Date.parse(b.created_at) : 0;
    return bt - at;
  });

  const filtered = state ? items.filter((j) => j.state === state) : items;
  return typeof limit === "number" && limit > 0 ? filtered.slice(0, limit) : filtered;
}

function hashFile(p: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

function appendEvent(eventsPath: string, evt: Record<string, unknown>) {
  fs.appendFileSync(eventsPath, JSON.stringify(evt) + "\n");
}

export function planScanCommands(input: StartScanInput, runDir: string, config: AppConfig): { bin: string; args: string[] }[] {
  const batchPattern = path.join(runDir, "page_%04d.tiff");
  const baseArgs = buildCommonArgs(input, batchPattern);
  return [{ bin: config.SCANIMAGE_BIN, args: baseArgs }];
}

function buildCommonArgs(input: StartScanInput, batchPattern: string): string[] {
  const args: string[] = [];
  if (input.device_id) args.push("-d", input.device_id);
  if (input.resolution_dpi) args.push("--resolution", String(input.resolution_dpi));
  if (input.color_mode) args.push("--mode", input.color_mode);
  if (input.source) args.push("--source", input.source);
  // Page size mapping via -x/-y in mm when provided
  const size = pageSizeMm(input);
  if (size) {
    args.push("-x", `${size.width}mm`, "-y", `${size.height}mm`);
  }
  // Always batch pages; both scanimage and scanadf forward these
  args.push(`--batch=${batchPattern}`);
  args.push("--format=tiff");
  return args;
}

export function segmentPages(pages: number[], policy?: StartScanInput["doc_break_policy"]): number[][] {
  if (!policy || !policy.type || policy.type === "none" || !policy.page_count) {
    return [pages];
  }
  if (policy.type === "page_count" && policy.page_count > 0) {
    const out: number[][] = [];
    for (let i = 0; i < pages.length; i += policy.page_count) {
      out.push(pages.slice(i, i + policy.page_count));
    }
    return out;
  }
  // Future: blank_page/timer/barcode
  return [pages];
}

async function assembleTiff(inputFiles: string[], outPath: string, config: AppConfig) {
  if (inputFiles.length === 0) return;
  if (config.SCAN_MOCK) {
    // In mock mode, directly copy the first page to simulate assembly
    fs.copyFileSync(inputFiles[0], outPath);
    return;
  }
  try {
    await execa(config.TIFFCP_BIN, [...inputFiles, outPath], { shell: false });
  } catch {
    // Fallback: copy the first page
    fs.copyFileSync(inputFiles[0], outPath);
  }
}

export async function resolveEffectiveInput(input: StartScanInput, config: AppConfig): Promise<StartScanInput> {
  const out: StartScanInput = { ...input };

  if (!out.device_id) {
    const sel = await selectDevice({ desiredSource: out.source, desiredResolutionDpi: out.resolution_dpi }, config, loadLastUsedDevice(config) || undefined);
    if (sel) out.device_id = sel.deviceId;
  }

  if (out.device_id) {
    try {
      const opts = await getDeviceOptions(out.device_id, config);
      if (!out.source && opts.sources && opts.sources.length) {
        const selected = opts.sources.includes("ADF Duplex")
          ? "ADF Duplex"
          : opts.sources.includes("ADF")
            ? "ADF"
            : opts.sources[0];
        out.source = selected as StartScanInput["source"];
      }
      // If duplex requested, prefer ADF Duplex when available
      if (out.duplex && opts.sources && opts.sources.includes("ADF Duplex")) {
        out.source = "ADF Duplex";
      }
      if (!out.resolution_dpi && opts.resolutions && opts.resolutions.length) {
        out.resolution_dpi = opts.resolutions.includes(DEFAULT_RESOLUTION_DPI) ? DEFAULT_RESOLUTION_DPI : opts.resolutions[opts.resolutions.length - 1];
      }
      if (!out.color_mode && opts.color_modes && opts.color_modes.length) {
        const selectedMode = opts.color_modes.includes("Color") ? "Color" : opts.color_modes[0];
        out.color_mode = selectedMode as StartScanInput["color_mode"];
      }
    } catch {
      // ignore
    }
  }

  if (!out.source) out.source = "Flatbed";
  if (!out.resolution_dpi) out.resolution_dpi = DEFAULT_RESOLUTION_DPI;

  return out;
}

function pageSizeMm(input: StartScanInput): { width: number; height: number } | null {
  if (input.page_size === "Custom" && input.custom_size_mm) {
    return { width: input.custom_size_mm.width, height: input.custom_size_mm.height };
  }
  switch (input.page_size) {
    case "Letter":
      return { width: LETTER_WIDTH_MM, height: LETTER_HEIGHT_MM };
    case "A4":
      return { width: A4_WIDTH_MM, height: A4_HEIGHT_MM };
    case "Legal":
      return { width: LEGAL_WIDTH_MM, height: LEGAL_HEIGHT_MM };
    default:
      return null;
  }
}

function stateDir(config: AppConfig) {
  const base = path.resolve(config.INBOX_DIR, "..", "..", ".state");
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function lastUsedPath(config: AppConfig) {
  return path.join(stateDir(config), "scan-mcp.json");
}

function saveLastUsedDevice(deviceId: string, config: AppConfig) {
  const p = lastUsedPath(config);
  try {
    fs.writeFileSync(p, JSON.stringify({ device_id: deviceId }, null, 2));
  } catch {}
}

function loadLastUsedDevice(config: AppConfig): string | null {
  const p = lastUsedPath(config);
  try {
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    return typeof j.device_id === "string" ? j.device_id : null;
  } catch {
    return null;
  }
}
