import { promises as fs } from "fs";
import path from "path";
import type { ExecaError } from "execa";

const DEFAULT_BYTE_WINDOW = 64 * 1024; // 64 KiB

// Read the last N lines of a UTF-8 text file by streaming from the end.
// Returns undefined on any error or if the file does not exist.
export async function tailTextFile(
  file: string,
  maxLines = 80,
  byteWindow = DEFAULT_BYTE_WINDOW,
): Promise<string | undefined> {
  try {
    await fs.access(file);
    const handle = await fs.open(file, "r");
    try {
      const { size } = await handle.stat();
      const readSize = Math.min(byteWindow, size);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, size - readSize);
      const lines = buffer.toString("utf8").split(/\r?\n/);
      return lines.slice(-maxLines).join("\n");
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

export function resolveJobPath(jobId: string, baseDir: string): string {
  if (!/^job-[0-9a-fA-F-]{36}$/.test(jobId)) throw new Error("invalid job_id");
  const base = path.resolve(baseDir);
  const full = path.resolve(base, jobId);
  if (!full.startsWith(base + path.sep)) throw new Error("invalid job_id");
  return full;
}

export function isExecaError(e: unknown): e is ExecaError {
  return typeof e === "object" && e !== null && "shortMessage" in e && "exitCode" in e;
}

export function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  if (!(e instanceof Error)) return false;
  return typeof e === "object" && e !== null && "code" in e;
}

// Replace `file` atomically: write a sibling temp file, then rename it into place, so a
// concurrent reader sees either the old content or the new, never a truncated file.
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

// A short, single-line description of an error. execa puts the child's buffered
// stdout/stderr into `message`; `shortMessage` is just the command and how it failed.
export function errorSummary(err: unknown): string {
  if (typeof err === "object" && err !== null && "shortMessage" in err && typeof err.shortMessage === "string") {
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}
