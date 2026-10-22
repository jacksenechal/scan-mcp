import { execa } from "execa";
import { createInterface } from "readline";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { resolveHelperPath } from "../helper-path.js";
import type { Backend, Device, DeviceOptions, RunScanArgs, RunScanResult } from "./backend.js";

const SourceCaps = z.object({ resolutions: z.array(z.number().int().positive()), color_modes: z.array(z.string()) });
const Options = SourceCaps.extend({ sources: z.array(z.string()), adf: z.boolean(), duplex: z.boolean(), per_source: z.record(SourceCaps) });
const Devices = z.object({ devices: z.array(z.object({ id: z.string(), vendor: z.string().optional(), model: z.string().optional() })) });
const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage"), stage: z.enum(["discovering", "opening_session", "selecting_functional_unit", "scanning"]) }),
  z.object({ type: z.literal("page_scanned"), index: z.number().int().positive(), path: z.string() }),
  z.object({ type: z.literal("warning"), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("complete"), pages: z.array(z.string()).min(1) }),
]);

export class IcaBackend implements Backend {
  readonly name = "ica" as const;

  async listDevices(ctx: AppContext): Promise<Device[]> {
    const { stdout } = await execa(resolveHelperPath(ctx.config), ["list-devices", "--browse-seconds", "3"], { shell: false, timeout: 15_000 });
    return Devices.parse(JSON.parse(stdout)).devices;
  }

  async getDeviceOptions(deviceId: string, ctx: AppContext): Promise<DeviceOptions> {
    const { stdout } = await execa(resolveHelperPath(ctx.config), ["device-options", "--device-id", deviceId, "--browse-seconds", "5"], { shell: false, timeout: 30_000 });
    return Options.parse(JSON.parse(stdout));
  }

  async runScan({ input, runDir, ctx, signal, onEvent }: RunScanArgs): Promise<RunScanResult> {
    signal.throwIfAborted();
    if (input.output_format && input.output_format !== "tiff") throw new Error("The ICA backend currently supports only output_format=tiff");
    if (input.page_size === "Custom" || input.custom_size_mm) throw new Error("Custom page sizes are not yet supported by the ICA backend");
    const params = JSON.stringify({
      device_id: input.device_id, resolution_dpi: input.resolution_dpi,
      color_mode: input.color_mode, source: input.source, duplex: input.duplex,
      page_size: input.page_size, output_format: "tiff",
    });
    const helper = resolveHelperPath(ctx.config);
    await onEvent({ type: "scanner_exec", data: { bin: helper, subcommand: "scan", runDir } });
    signal.throwIfAborted();
    const proc = execa(helper, ["scan", "--params", params, "--out-dir", runDir, "--browse-seconds", "8"], {
      shell: false, cancelSignal: signal, forceKillAfterDelay: 1000, timeout: 600_000,
    });
    // Observe rejection immediately, even while processing events from stdout.
    const finished = proc.then(() => undefined, (error: unknown) => error);
    proc.stderr?.on("data", (chunk: Buffer) => ctx.logger.debug({ helperStderr: chunk.toString("utf8") }, "ICA helper"));
    const pages: string[] = [];
    let complete = false;
    try {
      if (!proc.stdout) throw new Error("ICA helper stdout unavailable");
      const lines = createInterface({ input: proc.stdout, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          const event = Event.parse(JSON.parse(line));
          if (complete) throw new Error("ICA helper emitted events after completion");
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "complete") {
            if (event.pages.length !== pages.length || event.pages.some((p, i) => p !== pages[i])) {
              throw new Error("ICA helper completion does not match scanned pages");
            }
            complete = true;
          } else {
            if (event.type === "page_scanned") {
              if (event.index !== pages.length + 1) throw new Error("ICA helper page indices are out of order");
              pages.push(event.path);
            }
            // Await every write before processing the next event or returning.
            await onEvent(event);
          }
        }
      } finally {
        lines.close();
      }
      const error = await finished;
      if (error) throw error;
      signal.throwIfAborted();
      if (!complete) throw new Error("ICA helper exited without completing the scan");
      return { ran: true };
    } catch (error) {
      proc.kill("SIGTERM");
      await finished;
      await onEvent({ type: "scanner_failed", data: { error: String(error) } });
      throw error;
    }
  }

  async assembleTiff(pages: string[], output: string, ctx: AppContext, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    await execa(resolveHelperPath(ctx.config), ["assemble-tiff", "--output", output, ...pages], {
      shell: false, cancelSignal: signal, forceKillAfterDelay: 1000, timeout: 120_000,
    });
  }
}
