import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import { ConfigSchema } from "../config.js";
import type { AppContext } from "../context.js";
import { SaneBackend } from "../services/backends/sane.js";
import type { BackendEvent } from "../services/backends/backend.js";

// Make the log files slow to flush, as a busy disk would: each chunk lands 100ms after it is
// written. A failure tail read before the streams are closed then misses the final lines.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    createWriteStream: ((...args: Parameters<typeof actual.createWriteStream>) => {
      const stream = actual.createWriteStream(...args);
      const write = stream._write.bind(stream);
      stream._write = (chunk, encoding, callback) => {
        setTimeout(() => write(chunk, encoding, callback), 100);
      };
      return stream;
    }) as typeof actual.createWriteStream,
  };
});

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

describe("SaneBackend failure log tails", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "scan-mcp-flush-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("scanner_failed includes the scanner's final stderr and stdout lines", async () => {
    const ctx: AppContext = {
      logger,
      backend: new SaneBackend(),
      config: ConfigSchema.parse({ INBOX_DIR: dir, SCANIMAGE_BIN: path.resolve(__dirname, "fixtures/stderr-last-line.mjs") }),
    };
    const events: BackendEvent[] = [];
    const res = await ctx.backend.runScan({
      input: {},
      runDir: dir,
      ctx,
      signal: new AbortController().signal,
      onEvent: async (e) => {
        events.push(e);
      },
    });
    expect(res.ran).toBe(false);
    const failed = events.find((e) => e.type === "scanner_failed");
    if (failed?.type !== "scanner_failed") throw new Error("expected scanner_failed");
    expect(String(failed.data.stderrTail)).toMatch(/LAST_STDERR_LINE\s*$/);
    expect(String(failed.data.stdoutTail)).toMatch(/LAST_STDOUT_LINE\s*$/);
  });
});
