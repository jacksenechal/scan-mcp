import pino, { type Logger } from "pino";
import type { IncomingHttpHeaders } from "node:http";

export function createLogger(mode: "stdio" | "http", level: string): Logger {
  if (mode === "stdio") {
    // In stdio mode, never write to stdout (protocol channel)
    return pino({ level }, pino.destination({ fd: 2 }));
  }
  // In HTTP mode, use default (stdout) according to level
  return pino({ level });
}

export function maskAuthHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  const auth = headers["authorization"];
  const apiKey = headers["x-api-key"];
  if (typeof auth === "string") out["authorization"] = maskAuthorization(auth);
  if (typeof apiKey === "string") out["x-api-key"] = maskToken(apiKey);
  return out;
}

function maskAuthorization(v: string): string {
  // Preserve scheme; mask token
  const [scheme, ...rest] = v.split(/\s+/, 2);
  const token = rest.join(" ");
  return `${scheme} ${maskToken(token)}`.trim();
}

function maskToken(v: string): string {
  if (!v) return "";
  const tail = v.slice(-4);
  return v.length > 8 ? `***${tail}` : "***";
}

