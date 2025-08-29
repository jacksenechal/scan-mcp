import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tailTextFile } from "../services/file-io.js";

const tmpDir = path.resolve(__dirname, ".tmp-tail");

describe("tailTextFile", () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for missing file", () => {
    const res = tailTextFile(path.join(tmpDir, "missing.log"));
    expect(res).toBeUndefined();
  });

  it("returns last N lines", () => {
    const file = path.join(tmpDir, "log.txt");
    const lines = Array.from({ length: 200 }, (_, i) => `line-${i + 1}`);
    fs.writeFileSync(file, lines.join("\n"));
    const tail = tailTextFile(file, 10);
    expect(tail?.split("\n")).toEqual(lines.slice(-10));
  });
});
