import type { AppContext } from "../../context.js";

export type Device = {
  id: string;
  vendor?: string;
  model?: string;
  saneName?: string;
  capabilities?: {
    adf?: boolean;
    duplex?: boolean;
    color_modes?: string[];
    resolutions?: number[];
    page_sizes?: string[];
  };
};

export type DeviceOptions = {
  sources?: string[];
  color_modes?: string[];
  resolutions?: number[];
  adf?: boolean;
  duplex?: boolean;
};

export type StartScanInput = {
  device_id?: string;
  resolution_dpi?: number;
  // SANE backends vary (e.g., Halftone, Binary, Gray16); accept any string
  color_mode?: string;
  // The MCP tool schema restricts requests to "Flatbed" | "ADF" | "ADF Duplex", but the
  // effective/resolved value may be a device-specific string (e.g. "ADF Front") once
  // mapped against the device's reported sources, so this is widened to `string`.
  source?: string;
  duplex?: boolean;
  page_size?: "Letter" | "A4" | "Legal" | "Custom";
  custom_size_mm?: { width: number; height: number };
  doc_break_policy?: {
    type?: "blank_page" | "page_count" | "timer" | "barcode" | "none";
    blank_threshold?: number;
    page_count?: number;
    timer_ms?: number;
    barcode_values?: string[];
  };
  output_format?: string;
  tmp_dir?: string;
  // Detect carrier sheet leading-edge band and crop derivatives.
  crop_carrier_sheets?: boolean;
};

// Events emitted by a backend during runScan. jobs.ts forwards these to events.jsonl
// so the backend stays decoupled from the persistence format.
export type BackendEvent =
  | { type: "scanner_exec"; data: Record<string, unknown> }
  | { type: "scanner_failed"; data: Record<string, unknown> };

export type RunScanArgs = {
  input: StartScanInput;
  runDir: string;
  ctx: AppContext;
  signal: AbortSignal;
  onEvent: (evt: BackendEvent) => Promise<void>;
};

export type RunScanResult = {
  ran: boolean;
};

export interface Backend {
  readonly name: "sane" | "mock";
  listDevices(ctx: AppContext): Promise<Device[]>;
  getDeviceOptions(deviceId: string, ctx: AppContext): Promise<DeviceOptions>;
  // Drives the scanner. Writes page_NNNN.tiff files into runDir. Emits progress
  // events via onEvent. Respects signal.aborted by terminating any active subprocess.
  runScan(args: RunScanArgs): Promise<RunScanResult>;
  // Combines per-page TIFFs into one multipage document at `output`.
  assembleTiff(pages: string[], output: string, ctx: AppContext): Promise<void>;
  // Optional: backend-specific probe of whether a given resolution is accepted by the
  // device. SANE supports this via `scanimage -n`. Backends without a cheap probe
  // should leave undefined; callers fall back to the listed resolutions.
  probeResolution?(deviceId: string, dpi: number, ctx: AppContext): Promise<boolean>;
}
