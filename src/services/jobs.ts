import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { execa } from "execa";
import { loadConfig, type AppConfig } from "../config";

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

export async function startScanJob(input: StartScanInput): Promise<StartScanResult> {
  const config = loadConfig();
  const id = `job-${uuidv4()}`;
  const baseDir = input.tmp_dir ? path.resolve(input.tmp_dir) : path.resolve(config.INBOX_DIR);
  const runDir = path.join(baseDir, id);
  fs.mkdirSync(runDir, { recursive: true });

  const manifestPath = path.join(runDir, "manifest.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  const now = new Date().toISOString();

  const manifest: {
    job_id: string;
    device_id: string | null;
    created_at: string;
    params: StartScanInput;
    pages: { index: number; path: string; sha256: string }[];
    documents: { index: number; pages: number[]; path: string; sha256: string }[];
    state: "running" | "completed" | "cancelled" | "error";
  } = {
    job_id: id,
    device_id: input.device_id ?? null,
    created_at: now,
    params: input,
    pages: [] as { index: number; path: string; sha256: string }[],
    documents: [] as { index: number; pages: number[]; path: string; sha256: string }[],
    state: "running" as const,
  };

  appendEvent(eventsPath, { ts: now, type: "job_started", data: { input } });

  if (config.SCAN_MOCK) {
    // Create a couple of fake TIFFs to simulate capture
    const pageCount = 2;
    for (let i = 1; i <= pageCount; i++) {
      const p = path.join(runDir, `page_${String(i).padStart(4, "0")}.tiff`);
      fs.writeFileSync(p, `MOCK_TIFF_PAGE_${i}`);
      const sha256 = hashFile(p);
      manifest.pages.push({ index: i, path: p, sha256 });
      appendEvent(eventsPath, { ts: new Date().toISOString(), type: "page_captured", data: { index: i, path: p } });
    }
    // One document with both pages (simulate assembly)
    const docPath = path.join(runDir, `doc_0001.tiff`);
    fs.writeFileSync(docPath, `MOCK_TIFF_DOC_1`);
    manifest.documents.push({ index: 1, pages: [1, 2], path: docPath, sha256: hashFile(docPath) });

    manifest.state = "completed";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return { job_id: id, run_dir: runDir, state: manifest.state };
  }

  // Real execution path (not used during tests unless SCAN_MOCK=0)
  const candidates = planScanCommands(input, runDir, config);
  let ran = false;
  for (const c of candidates) {
    try {
      await execa(c.bin, c.args, { cwd: runDir, shell: false, stdio: "inherit" });
      ran = true;
      break;
    } catch (err) {
      appendEvent(eventsPath, { ts: new Date().toISOString(), type: "scanner_primary_failed", data: { bin: c.bin, args: c.args, err: String(err) } });
      continue;
    }
  }
  if (!ran) {
    manifest.state = "error";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    appendEvent(eventsPath, { ts: new Date().toISOString(), type: "job_error", data: { reason: "all candidates failed" } });
    return { job_id: id, run_dir: runDir, state: manifest.state };
  }

  // Collect pages and assemble simple manifest
  const pages = fs
    .readdirSync(runDir)
    .filter((f) => f.startsWith("page_") && f.endsWith(".tiff"))
    .sort()
    .map((f, idx) => {
      const p = path.join(runDir, f);
      return { index: idx + 1, path: p, sha256: hashFile(p) };
    });
  manifest.pages.push(...pages);

  // Segment into documents per doc_break_policy (page_count only for now)
  const segments = segmentPages(pages.map((p) => p.index), input.doc_break_policy);
  let docIdx = 1;
  for (const seg of segments) {
    const outDoc = path.join(runDir, `doc_${String(docIdx).padStart(4, "0")}.tiff`);
    const segFiles = seg.map((i) => pages[i - 1]?.path).filter(Boolean) as string[];
    await assembleTiff(segFiles, outDoc, config);
    manifest.documents.push({ index: docIdx, pages: seg, path: outDoc, sha256: hashFile(outDoc) });
    docIdx++;
  }

  manifest.state = "completed";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  appendEvent(eventsPath, { ts: new Date().toISOString(), type: "job_completed" });

  return { job_id: id, run_dir: runDir, state: manifest.state };
}

export async function getJobStatus(jobId: string, baseDir?: string) {
  const config = loadConfig();
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

export async function cancelJob(jobId: string, baseDir?: string) {
  const config = loadConfig();
  const runDir = path.join(path.resolve(baseDir ?? config.INBOX_DIR), jobId);
  const manifestPath = path.join(runDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { ok: false, error: "manifest not found" } as const;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.state = "cancelled";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  appendEvent(path.join(runDir, "events.jsonl"), { ts: new Date().toISOString(), type: "job_cancelled" });
  return { ok: true } as const;
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
  const wantsAdf = !!(input.source && /ADF/i.test(input.source));
  if (wantsAdf) {
    return [
      { bin: config.SCANADF_BIN, args: baseArgs },
      { bin: config.SCANIMAGE_BIN, args: baseArgs },
    ];
  }
  return [{ bin: config.SCANIMAGE_BIN, args: baseArgs }];
}

function buildCommonArgs(input: StartScanInput, batchPattern: string): string[] {
  const args: string[] = [];
  if (input.device_id) args.push("-d", input.device_id);
  if (input.resolution_dpi) args.push("--resolution", String(input.resolution_dpi));
  if (input.color_mode) args.push("--mode", input.color_mode);
  if (input.source) args.push("--source", input.source);
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
  try {
    await execa(config.TIFFCP_BIN, [...inputFiles, outPath], { shell: false });
  } catch {
    // Fallback: copy the first page
    fs.copyFileSync(inputFiles[0], outPath);
  }
}
