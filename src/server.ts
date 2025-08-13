import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pino from "pino";
import AjvModule from "ajv";
import type { ValidateFunction } from "ajv";
import { v4 as uuidv4 } from "uuid";

import { loadConfig } from "./config.js";
import { listDevices, getDeviceOptions } from "./services/sane.js";
import { startScanJob, getJobStatus, cancelJob, type StartScanInput } from "./services/jobs.js";
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const Ajv = AjvModule as unknown as typeof import("ajv").default;

type Tool = {
  name: string;
  schemaPath: string;
  validate?: ValidateFunction;
  impl?: (input: unknown) => Promise<unknown>;
};

function loadSchemas(dir: string) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schemasDir = path.resolve(dir);
  const tools: Record<string, Tool> = {};

  for (const f of fs.readdirSync(schemasDir)) {
    if (!f.endsWith(".schema.json")) continue;
    const fullname = path.join(schemasDir, f);
    const raw = fs.readFileSync(fullname, "utf8");
    const json = JSON.parse(raw);
    const name = json.$id || f.replace(".schema.json", "");
    const validate = ajv.compile(json);
    tools[name] = { name, schemaPath: fullname, validate };
  }

  return { ajv, tools };
}

function makeStubImplementations(tools: Record<string, Tool>) {
  // Minimal deterministic stubs to allow smoke tests
  if (tools["/scan/list_devices"]) {
    tools["/scan/list_devices"].impl = async () => listDevices();
  }

  if (tools["/scan/start_scan_job"]) {
    tools["/scan/start_scan_job"].impl = async (input: unknown) => startScanJob(input as StartScanInput);
  }

  if (tools["/scan/get_device_options"]) {
    tools["/scan/get_device_options"].impl = async (input: unknown) => {
      const rec = (input ?? {}) as Record<string, unknown>;
      const deviceId = String(rec["device_id"] || "");
      return getDeviceOptions(deviceId);
    };
  }

  if (tools["/scan/get_job_status"]) {
    tools["/scan/get_job_status"].impl = async (input: unknown) => {
      const rec = (input ?? {}) as Record<string, unknown>;
      const jobId = String(rec["job_id"] || "");
      return getJobStatus(jobId);
    };
  }

  if (tools["/scan/cancel_job"]) {
    tools["/scan/cancel_job"].impl = async (input: unknown) => {
      const rec = (input ?? {}) as Record<string, unknown>;
      const jobId = String(rec["job_id"] || "");
      return cancelJob(jobId);
    };
  }

  // Default NotImplemented stub for any declared tool without a specific impl
  for (const key of Object.keys(tools)) {
    if (!tools[key].impl) {
      tools[key].impl = async () => ({ error: "NotImplemented", tool: key });
    }
  }

  return tools;
}

export async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, "..");
  const schemasDir = path.join(projectRoot, "schemas");
  if (!fs.existsSync(schemasDir)) {
    logger.error({ schemasDir }, "Schemas directory not found");
    process.exit(1);
  }

  const { tools } = loadSchemas(schemasDir);
  makeStubImplementations(tools);

  logger.info({ tools: Object.keys(tools) }, "scan-mcp starting (stub)");

  // Simple CLI surface for smoke tests:
  //   - `node src/server.ts list` -> list tools
  //   - `node src/server.ts call <toolId> '{"foo": "bar"}'` -> validate & run stub impl
  const argv = process.argv.slice(2);

  if (argv[0] === "list") {
    console.log("tools:");
    for (const k of Object.keys(tools)) {
      console.log("-", k);
    }
    process.exit(0);
  }

  if (argv[0] === "call") {
    const toolId = argv[1];
    const payload = argv[2] ? (JSON.parse(argv[2]) as unknown) : undefined;
    const tool = tools[toolId];
    if (!tool) {
      console.error("tool not found:", toolId);
      process.exit(2);
    }

    const runId = uuidv4();
    logger.info({ run_id: runId, tool: toolId, payload }, "tool call received");

    if (!tool.validate!(payload)) {
      logger.error({ run_id: runId, errors: tool.validate!.errors }, "validation failed");
      console.error(JSON.stringify({ ok: false, errors: tool.validate!.errors }, null, 2));
      process.exit(3);
    }

    try {
      const result = await tool.impl!(payload);
      logger.info({ run_id: runId, result }, "tool executed");
      console.log(JSON.stringify({ ok: true, result }, null, 2));
      process.exit(0);
    } catch (err) {
      logger.error({ run_id: runId, err }, "tool implementation error");
      console.error(JSON.stringify({ ok: false, error: String(err) }, null, 2));
      process.exit(4);
    }
  }

  // Default: print basic info and exit
  console.log("scan-mcp (stub) - available commands:");
  console.log("  node src/server.ts list");
  console.log("  node src/server.ts call <toolId> '<json-payload>'");
  process.exit(0);
}

const isMain = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return path.resolve(process.argv[1] || "") === thisFile;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    logger.error({ err }, "unexpected error");
    process.exit(1);
  });
}

// Expose schema-loading and stub utilities for tests
export { loadSchemas, makeStubImplementations };
