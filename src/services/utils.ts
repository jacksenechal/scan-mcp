import { promises as fs } from "fs";
import path from "path";

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
