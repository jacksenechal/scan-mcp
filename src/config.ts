import { z } from "zod";
import type { ZodIssue } from "zod";
import dotenv from "dotenv";
import os from "os";

export const ConfigSchema = z.object({
  LOG_LEVEL: z.string().default("info"),
  INBOX_DIR: z.string().default("scanned_documents/inbox"),
  SCAN_MOCK: z.boolean().default(false),
  SCANIMAGE_BIN: z.string().default("scanimage"),
  TIFFCP_BIN: z.string().default("tiffcp"),
  IM_CONVERT_BIN: z.string().default("convert"),
  // By default, exclude camera-like backends like v4l from device lists
  SCAN_EXCLUDE_BACKENDS: z.array(z.string()).default(["v4l"]),
  SCAN_PREFER_BACKENDS: z.array(z.string()).default([]),
  // Control whether we persist last-used device preference under .state/
  PERSIST_LAST_USED_DEVICE: z.boolean().default(true),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/** HTTP transport (--http) settings; kept apart so stdio and service code never carry them. */
export const HttpConfigSchema = z.object({
  // Port 0 asks the OS for an ephemeral port (used by tests).
  MCP_HTTP_HOST: z
    .string()
    .min(1)
    .refine((h) => !/[\s/@?#]/.test(h), "must be a bare hostname or IP address")
    .default("127.0.0.1"),
  MCP_HTTP_PORT: z.number().int().min(0).max(65535).default(3001),
  // Required when MCP_HTTP_HOST is not a loopback address.
  MCP_HTTP_TOKEN: z.string().min(1).optional(),
  // Extra Host/Origin hostnames accepted (e.g. a reverse proxy or tunnel's public name).
  MCP_HTTP_ALLOWED_HOSTS: z.array(z.string().min(1)).default([]),
});

export type HttpConfig = z.infer<typeof HttpConfigSchema>;

export function loadConfig(): AppConfig {
  // Quiet dotenv to avoid writing to stdout which would break MCP stdio
  dotenv.config({ quiet: true });
  const env = {
    LOG_LEVEL: process.env.LOG_LEVEL,
    INBOX_DIR: process.env.INBOX_DIR,
    SCAN_MOCK: parseEnvBool(process.env.SCAN_MOCK),
    SCANIMAGE_BIN: process.env.SCANIMAGE_BIN,
    TIFFCP_BIN: process.env.TIFFCP_BIN,
    IM_CONVERT_BIN: process.env.IM_CONVERT_BIN,
    SCAN_EXCLUDE_BACKENDS: parseCsv(process.env.SCAN_EXCLUDE_BACKENDS),
    SCAN_PREFER_BACKENDS: parseCsv(process.env.SCAN_PREFER_BACKENDS),
    PERSIST_LAST_USED_DEVICE: parseEnvBool(process.env.PERSIST_LAST_USED_DEVICE),
  };
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) throw configError(parsed.error.issues);
  return { ...parsed.data, INBOX_DIR: expandTilde(parsed.data.INBOX_DIR) };
}

export function loadHttpConfig(): HttpConfig {
  dotenv.config({ quiet: true });
  const parsed = HttpConfigSchema.safeParse({
    MCP_HTTP_HOST: process.env.MCP_HTTP_HOST,
    MCP_HTTP_PORT: parseEnvInt(process.env.MCP_HTTP_PORT),
    MCP_HTTP_TOKEN: process.env.MCP_HTTP_TOKEN || undefined,
    MCP_HTTP_ALLOWED_HOSTS: parseCsv(process.env.MCP_HTTP_ALLOWED_HOSTS),
  });
  if (!parsed.success) throw configError(parsed.error.issues);
  return parsed.data;
}

// Compact error message for quick local feedback
function configError(issues: ZodIssue[]): Error {
  return new Error(
    "Configuration validation failed: " + issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
  );
}

/**
 * Expand a leading `~` (referring to the current user's home directory) at the start
 * of a path, e.g. "~/Documents/inbox" -> "/home/user/Documents/inbox" and "~" alone ->
 * "/home/user". Paths not starting with `~` are returned unchanged.
 */
export function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return p.replace(/^~/, os.homedir());
  return p;
}

function parseEnvBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === "1" || v?.toLowerCase() === "true") return true;
  if (v === "0" || v?.toLowerCase() === "false") return false;
  return undefined;
}

/** Parse a decimal integer; non-numeric input becomes NaN so zod rejects it (undefined stays undefined). */
function parseEnvInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  return /^\d+$/.test(v.trim()) ? Number(v.trim()) : Number.NaN;
}

function parseCsv(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
