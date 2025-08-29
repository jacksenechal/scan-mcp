import fs from "fs";

const DEFAULT_BYTE_WINDOW = 64 * 1024; // 64 KiB

// Read the last N lines of a UTF-8 text file by streaming from the end.
// Returns undefined on any error or if the file does not exist.
export function tailTextFile(
  file: string,
  maxLines = 80,
  byteWindow = DEFAULT_BYTE_WINDOW,
): string | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    const fd = fs.openSync(file, "r");
    try {
      const { size } = fs.fstatSync(fd);
      const readSize = Math.min(byteWindow, size);
      const buffer = Buffer.alloc(readSize);
      // Read the last `readSize` bytes from the file
      fs.readSync(fd, buffer, 0, readSize, size - readSize);
      const lines = buffer.toString("utf8").split(/\r?\n/);
      return lines.slice(-maxLines).join("\n");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}
