import { createWriteStream, type WriteStream } from "fs";
import path from "path";
import { execa, type ExecaError } from "execa";
import type { AppContext } from "../../context.js";
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  LEGAL_HEIGHT_MM,
  LEGAL_WIDTH_MM,
  LETTER_HEIGHT_MM,
  LETTER_WIDTH_MM,
} from "../../constants.js";
import { tailTextFile } from "../utils.js";
import type {
  Backend,
  Device,
  DeviceOptions,
  RunScanArgs,
  RunScanResult,
  StartScanInput,
} from "./backend.js";

export class SaneBackend implements Backend {
  readonly name = "sane" as const;

  async listDevices(ctx: AppContext): Promise<Device[]> {
    const { config, logger } = ctx;
    try {
      const { stdout } = await execa(config.SCANIMAGE_BIN, ["-L"], { shell: false });
      const devices = parseScanimageList(stdout);
      return devices.filter((d) => {
        const backend = String(d.id.split(":")[0] || "");
        return !config.SCAN_EXCLUDE_BACKENDS.includes(backend);
      });
    } catch (err) {
      logger.error({ err }, "Failed to list devices");
      return [];
    }
  }

  async getDeviceOptions(deviceId: string, ctx: AppContext): Promise<DeviceOptions> {
    const { config, logger } = ctx;
    try {
      const { stdout } = await execa(config.SCANIMAGE_BIN, ["-A", "-d", deviceId], { shell: false });
      return parseScanimageOptions(stdout);
    } catch (err) {
      logger.error({ err, deviceId }, "Failed to get device options");
      return {};
    }
  }

  async probeResolution(deviceId: string, dpi: number, ctx: AppContext): Promise<boolean> {
    try {
      await execa(
        ctx.config.SCANIMAGE_BIN,
        ["-n", "-d", deviceId, "--resolution", String(dpi)],
        { shell: false }
      );
      return true;
    } catch {
      return false;
    }
  }

  async runScan(args: RunScanArgs): Promise<RunScanResult> {
    const { input, runDir, ctx, signal, onEvent } = args;
    const { logger } = ctx;
    const candidates = planScanCommands(input, runDir, ctx);

    let ran = false;
    for (const c of candidates) {
      if (signal.aborted) break;
      const outPath = path.join(runDir, "scanner.out.log");
      const errPath = path.join(runDir, "scanner.err.log");
      let outStream: WriteStream | undefined;
      let errStream: WriteStream | undefined;
      try {
        await onEvent({ type: "scanner_exec", data: { bin: c.bin, args: c.args, runDir } });
        signal.throwIfAborted();
        logger.debug({ cmd: c, runDir }, "scanner exec");
        // Do not inherit stdio; pipe and persist logs to files to avoid polluting MCP stdout
        const proc = execa(c.bin, c.args, {
          cwd: runDir, shell: false, cancelSignal: signal, forceKillAfterDelay: 1000,
        });
        outStream = createWriteStream(outPath, { flags: "a" });
        errStream = createWriteStream(errPath, { flags: "a" });
        proc.stdout?.pipe(outStream);
        proc.stderr?.pipe(errStream);
        await proc;
        ran = true;
        break;
      } catch (err) {
        const stderrTail = await tailTextFile(errPath, 120);
        const stdoutTail = await tailTextFile(outPath, 60);

        const errorInfo: Record<string, unknown> = {
          runDir,
          cmd: c,
          stderrTail,
          stdoutTail,
        };

        if (isExecaError(err)) {
          errorInfo.kind = "execa";
          errorInfo.exitCode = err.exitCode;
          errorInfo.signal = err.signal;
          errorInfo.shortMessage = err.shortMessage;
          errorInfo.originalMessage = err.originalMessage;
        } else if (isNodeError(err)) {
          errorInfo.kind = "node";
          errorInfo.code = err.code;
          errorInfo.errno = err.errno;
          errorInfo.message = err.message;
          errorInfo.name = err.name;
          errorInfo.stack = err.stack;
        } else {
          errorInfo.kind = "unknown";
          errorInfo.error = String(err);
        }

        await onEvent({ type: "scanner_failed", data: errorInfo });
        logger.error(errorInfo, "scanner command failed");
        continue;
      } finally {
        try { outStream?.end(); } catch {}
        try { errStream?.end(); } catch {}
      }
    }
    return { ran };
  }
}

// --- Pure helpers (exported for tests and SaneBackend.runScan) ---

export function parseScanimageList(text: string): Device[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const result: Device[] = [];
  for (const line of lines) {
    // Example: device `epjitsu:libusb:001:004' is a FUJITSU ScanSnap S1500 scanner
    const m = line.match(/^device `(.+?)\' is a (.+)$/);
    if (!m) continue;
    const id = m[1];
    const desc = m[2];
    const parts = desc.replace(/\s+scanner.*/i, "").split(/\s+/);
    const vendor = parts[0];
    const model = parts.slice(1).join(" ") || undefined;
    result.push({ id, vendor, model });
  }
  return result;
}

export function parseScanimageOptions(text: string): DeviceOptions {
  const opts: DeviceOptions = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/--source\b/.test(line)) {
      const values = extractEnumValues(line);
      opts.sources = values;
      opts.adf = values.some((v) => /ADF/i.test(v));
      opts.duplex = values.some((v) => /duplex/i.test(v));
    }
    if (/--mode\b/.test(line)) {
      opts.color_modes = extractEnumValues(line);
    }
    if (/--resolution\b/.test(line)) {
      const nums = Array.from(line.matchAll(/(\d{2,4})\s*dpi?/gi)).map((m) => parseInt(m[1], 10));
      if (nums.length === 0) {
        const bare = Array.from(line.matchAll(/\b(\d{2,4})\b/g)).map((m) => parseInt(m[1], 10));
        if (bare.length) opts.resolutions = Array.from(new Set(bare)).sort((a, b) => a - b);
      } else {
        opts.resolutions = Array.from(new Set(nums)).sort((a, b) => a - b);
      }
    }
  }
  return opts;
}

function extractEnumValues(line: string): string[] {
  const m = line.match(/([\w\s\/\-]+(?:\|[\w\s\/\-]+)+)/);
  if (!m) return [];
  return m[1]
    .split("|")
    .map((s) => s.trim().replace(/^--[a-z\-]+\s+/i, ""))
    .filter(Boolean);
}

export function planScanCommands(
  input: StartScanInput,
  runDir: string,
  ctx: AppContext
): { bin: string; args: string[] }[] {
  const batchPattern = path.join(runDir, "page_%04d.tiff");
  const baseArgs = buildCommonArgs(input, batchPattern);
  return [{ bin: ctx.config.SCANIMAGE_BIN, args: baseArgs }];
}

function buildCommonArgs(input: StartScanInput, batchPattern: string): string[] {
  const args: string[] = [];
  if (input.device_id) args.push("-d", input.device_id);
  if (input.resolution_dpi) args.push("--resolution", String(input.resolution_dpi));
  if (input.color_mode) args.push("--mode", input.color_mode);
  if (input.source) args.push("--source", input.source);
  const size = pageSizeMm(input);
  if (size) {
    args.push("-x", `${size.width}mm`, "-y", `${size.height}mm`);
  }
  args.push(`--batch=${batchPattern}`);
  args.push("--format=tiff");
  return args;
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

function isExecaError(e: unknown): e is ExecaError {
  return typeof e === "object" && e !== null && "shortMessage" in e && "exitCode" in e;
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  if (!(e instanceof Error)) return false;
  return typeof e === "object" && e !== null && "code" in e;
}
