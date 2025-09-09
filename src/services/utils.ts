import fs from "fs";
import path from "path";

// Read the last N lines of a UTF-8 text file, returning undefined on any error
export function tailTextFile(file: string, maxLines = 80): string | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    const data = fs.readFileSync(file, "utf8");
    const lines = data.split(/\r?\n/);
    const start = Math.max(0, lines.length - maxLines);
    return lines.slice(start).join("\n");
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
