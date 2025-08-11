import { z } from "zod";
import type { ZodIssue } from "zod";
import dotenv from "dotenv";

export const ConfigSchema = z.object({
  LOG_LEVEL: z.string().default("info"),
  INBOX_DIR: z.string().default("inbox"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  dotenv.config();
  const env = {
    LOG_LEVEL: process.env.LOG_LEVEL,
    INBOX_DIR: process.env.INBOX_DIR,
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
