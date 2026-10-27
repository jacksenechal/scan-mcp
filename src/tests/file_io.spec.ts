import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { errorSummary, tailTextFile, writeFileAtomic } from "../services/utils.js";

const tmpDir = path.resolve(__dirname, ".tmp-tail");

describe("tailTextFile", () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for missing file", async () => {
    await expect(tailTextFile(path.join(tmpDir, "missing.log"))).resolves.toBeUndefined();
  });

  it("returns last N lines", async () => {
    const file = path.join(tmpDir, "log.txt");
    const lines = Array.from({ length: 200 }, (_, i) => `line-${i + 1}`);
    fs.writeFileSync(file, lines.join("\n"));
    await expect(tailTextFile(file, 10)).resolves.toEqual(lines.slice(-10).join("\n"));
  });
});

describe("writeFileAtomic", () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("replaces the file and leaves no temp file behind", async () => {
    const file = path.join(tmpDir, "manifest.json");
    await writeFileAtomic(file, "old");
    await writeFileAtomic(file, "new");
    expect(fs.readFileSync(file, "utf8")).toBe("new");
    expect(fs.readdirSync(tmpDir)).toEqual(["manifest.json"]);
  });

  it("cleans up its temp file when the rename fails", async () => {
    const target = path.join(tmpDir, "target");
    fs.mkdirSync(path.join(target, "child"), { recursive: true });
    await expect(writeFileAtomic(target, "data")).rejects.toThrow();
    expect(fs.readdirSync(tmpDir)).toEqual(["target"]);
  });
});

describe("errorSummary", () => {
  it("prefers an execa-style shortMessage", () => {
    const err = Object.assign(new Error("long message with NOISY output"), { shortMessage: "Command failed: tiffcp" });
    expect(errorSummary(err)).toBe("Command failed: tiffcp");
  });

  it("uses the message of a plain Error, without the name prefix", () => {
    expect(errorSummary(new Error("Scanner produced no pages"))).toBe("Scanner produced no pages");
  });

  it("stringifies non-Error values", () => {
    expect(errorSummary("boom")).toBe("boom");
  });
});
