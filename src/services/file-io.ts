import fs from "fs";

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
