import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { accessSync, constants, statSync } from "fs";
import { loadConfig } from "./config.js";
import type { AppConfig } from "./config.js";

const MIN_NODE_MAJOR_VERSION = 22;

type CommandEnvVar = "SCANIMAGE_BIN" | "TIFFCP_BIN" | "IM_CONVERT_BIN";

type RequiredTool = {
  envVar: CommandEnvVar;
  defaultCommand: string;
  description: string;
};

const REQUIRED_TOOLS: readonly RequiredTool[] = [
  { envVar: "SCANIMAGE_BIN", defaultCommand: "scanimage", description: "SANE CLI (scanimage)" },
  { envVar: "TIFFCP_BIN", defaultCommand: "tiffcp", description: "TIFF page assembler (tiffcp)" },
  { envVar: "IM_CONVERT_BIN", defaultCommand: "convert", description: "ImageMagick convert" },
] as const;

export type MissingDependency = RequiredTool & { command: string };

export interface DetectMissingDependenciesOptions {
  commandAvailable?: (command: string) => boolean;
}

export type PreflightErrorDetails =
  | { type: "node-version"; requiredMajor: number; currentVersion: string }
  | { type: "missing-dependencies"; missing: MissingDependency[] };

export class PreflightError extends Error {
  public readonly code = "SCAN_MCP_PREFLIGHT_FAILED" as const;
  public readonly details: PreflightErrorDetails;

  constructor(message: string, details: PreflightErrorDetails) {
    super(message);
    this.name = "PreflightError";
    this.details = details;
  }
}

export interface EnsureEnvironmentOptions {
  nodeVersion?: string;
  config?: AppConfig;
  skipCommandCheck?: boolean;
  verbose?: boolean;
}

export function ensureEnvironmentReady(options: EnsureEnvironmentOptions = {}): void {
  const nodeVersion = options.nodeVersion ?? process.version;
  const majorVersion = parseNodeMajor(nodeVersion);
  const verbose = options.verbose ?? false;

  if (!majorVersion || majorVersion < MIN_NODE_MAJOR_VERSION) {
    if (verbose) {
      console.log(`✗ Node.js version check (${formatNodeVersion(nodeVersion)} < v${MIN_NODE_MAJOR_VERSION})`);
    }
    const message = [
      `scan-mcp requires Node.js ${MIN_NODE_MAJOR_VERSION} or newer (current: ${formatNodeVersion(nodeVersion)}).`,
      "Update your runtime before running `npx scan-mcp`.",
      "If you use nvm:",
      "  nvm install 22",
      "  nvm use 22",
    ].join("\n");
    throw new PreflightError(message, {
      type: "node-version",
      requiredMajor: MIN_NODE_MAJOR_VERSION,
      currentVersion: formatNodeVersion(nodeVersion),
    });
  }

  if (verbose) {
    console.log(`✓ Node.js version check (${formatNodeVersion(nodeVersion)})`);
  }

  if (options.skipCommandCheck) {
    if (verbose) {
      console.log("\n✓ All preflight checks passed!");
    }
    return;
  }

  const config = options.config ?? loadConfig();
  const missing = detectMissingDependencies(config);

  if (verbose) {
    // Check each tool individually for detailed output
    for (const tool of REQUIRED_TOOLS) {
      const isMissing = missing.some(m => m.envVar === tool.envVar);
      if (isMissing) {
        console.log(`✗ ${tool.description}`);
      } else {
        console.log(`✓ ${tool.description}`);
      }
    }
  }

  if (missing.length > 0) {
    const message = [
      "scan-mcp could not find the system tools it needs to talk to your scanner:",
      ...missing.map((dep) =>
        `  • ${dep.description} [${dep.envVar}=${dep.command || dep.defaultCommand}]`
      ),
      "",
      "Install SANE utilities and TIFF tools before continuing:",
      "  Ubuntu/Debian: sudo apt install sane-utils libtiff-tools imagemagick",
      "  Arch Linux:    sudo pacman -S sane libtiff imagemagick",
      "  Fedora:        sudo dnf install sane-backends-utils libtiff-tools ImageMagick",
      "",
      "If the tools live elsewhere, set SCANIMAGE_BIN, TIFFCP_BIN, or IM_CONVERT_BIN to point at them.",
    ].join("\n");
    throw new PreflightError(message, { type: "missing-dependencies", missing });
  }

  if (verbose) {
    console.log("All preflight checks passed!");
  }
}

export function detectMissingDependencies(
  config: AppConfig,
  options: DetectMissingDependenciesOptions = {}
): MissingDependency[] {
  const isAvailable = options.commandAvailable ?? isCommandAvailable;
  const missing: MissingDependency[] = [];
  for (const tool of REQUIRED_TOOLS) {
    const configured = (config[tool.envVar] ?? "").trim();
    if (!configured || !isAvailable(configured)) {
      missing.push({ ...tool, command: configured || tool.defaultCommand });
    }
  }
  return missing;
}

function parseNodeMajor(version: string | undefined): number | undefined {
  if (!version) return undefined;
  const normalized = version.startsWith("v") ? version.slice(1) : version;
  const [major] = normalized.split(".");
  const parsed = Number.parseInt(major ?? "", 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatNodeVersion(version: string | undefined): string {
  if (!version) return "unknown";
  return version.startsWith("v") ? version : `v${version}`;
}

function isCommandAvailable(command: string): boolean {
  const expanded = expandUser(command.trim());
  if (!expanded) return false;
  if (hasPathSeparator(expanded)) {
    const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(expanded);
    return isExecutable(resolved);
  }

  if (process.platform === "win32") {
    const result = spawnSync("where", [expanded], { stdio: "ignore" });
    return result.status === 0;
  }

  const quoted = escapeShellArg(expanded);
  const result = spawnSync("sh", ["-c", `command -v ${quoted} >/dev/null 2>&1`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function expandUser(input: string): string {
  if (!input.startsWith("~")) return input;
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input; // "~user" styles not supported
}

function hasPathSeparator(command: string): boolean {
  return command.includes("/") || command.includes("\\");
}

function isExecutable(filePath: string): boolean {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile() && !stats.isSymbolicLink()) return false;
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function escapeShellArg(value: string): string {
  if (value === "") return "''";
  return `'${value.replace(/'/g, "'\\''")}'`;
}
