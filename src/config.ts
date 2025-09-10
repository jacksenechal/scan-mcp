import { z } from "zod";
import type { ZodIssue } from "zod";
import dotenv from "dotenv";

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
  if (!parsed.success) {
    // Throw a compact error message for quick local feedback
    throw new Error(
      "Configuration validation failed: " +
        parsed.error.issues.map((e: ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; ")
    );
  }
  return parsed.data;
}

function parseEnvBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === "1" || v?.toLowerCase() === "true") return true;
  if (v === "0" || v?.toLowerCase() === "false") return false;
  return undefined;
}

function parseCsv(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
