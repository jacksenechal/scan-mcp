import path from "path";
import { fileURLToPath } from "url";
import { expandTilde, type AppConfig } from "../config.js";

// Both src/services and dist/services live two levels below the package root.
// Honor overrides exactly: a typo must not silently select another executable.
export function resolveHelperPath(config: AppConfig): string {
  return config.MCP_SCANNER_HELPER_BIN
    ? path.resolve(expandTilde(config.MCP_SCANNER_HELPER_BIN))
    : fileURLToPath(new URL("../../dist/bin/mcp-scanner-helper", import.meta.url));
}
