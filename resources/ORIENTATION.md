# scan-mcp — LLM Orientation

Last modified: 2025-08-29

Purpose: Give an LLM concise, actionable context for initiating and managing scanning workflows via the `scan-mcp` server.

## What This Server Does
- Discovers scanners and their capabilities (sources, resolutions, color modes).
- Starts a scan job that captures pages to TIFF files and assembles multipage docs.
- Emits a manifest and event log per job; exposes helper tools to inspect both.

## Core Defaults (when user gives no specifics)
- Resolution: 300 dpi (probes support; otherwise picks nearest available).
- Color mode: Lineart (fallback order: Lineart → Gray → Halftone → Color).
- Source: ADF Duplex (fallback order: ADF Duplex → ADF → Flatbed).
- Page size: None (scanner/backend default) (no `-x`/`-y` unless the user sets `page_size`).
- Output: Batched TIFF pages named `page_%04d.tiff` in the job’s `run_dir`.

These defaults are applied after device/capabilities are known. If the user supplies any of these fields, the server normalizes them to what the device supports.

## Tooling Cheat Sheet
- `list_devices`: Enumerate connected scanners and basic capabilities.
- `get_device_options { device_id }`: Detailed options (sources/resolutions/modes).
- `start_scan_job { ... }`: Start a scan (auto-select device and fill defaults if params omitted).
- `get_job_status { job_id }`: Poll job state and artifact counts.
- `cancel_job { job_id }`: Attempt to stop a running scan.
- `list_jobs { limit?, state? }`: Recent jobs under the inbox directory.
- `get_manifest { job_id }`: Fetch raw manifest JSON for a job.
- `get_events { job_id }`: Fetch raw events JSONL for a job.

Inputs for `start_scan_job` (all optional unless specified):
- `device_id`: Pick a specific scanner; otherwise auto-select.
- `resolution_dpi`: Desired dpi (default target 300).
- `color_mode`: e.g., `Lineart`, `Gray`, `Halftone`, `Color`.
- `source`: `Flatbed` | `ADF` | `ADF Duplex`.
- `duplex`: boolean; if `true` and device supports `ADF Duplex`, it is preferred.
- `page_size`: `Letter` | `A4` | `Legal` | `Custom` (+ `custom_size_mm`).
- `doc_break_policy`: Advanced per-page splitting config (optional).
- `tmp_dir`: Override base dir for `run_dir` placement (optional).

## Mapping User Requests To Parameters

General rule: If the user is vague, use sensible defaults. If the user’s intent implies high fidelity or a specific use-case, adjust params accordingly.

Examples:
- “Scan this” or “Start a scan”
  - Use defaults; call `start_scan_job` with no params (e.g., `{}`).

- “Scan a photo” / “High-quality photo”
  - Prefer flatbed, highest available resolution, and `Color` mode.
  - Strategy:
    1) If `device_id` is unknown, call `list_devices` → pick one (or let the server auto-select).
    2) Call `get_device_options { device_id }`.
    3) Choose `resolution_dpi` = max supported; `color_mode` = `Color` (or nearest), `source` = `Flatbed`.
    4) Call `start_scan_job` with those params.
  - Example params: `{ "source": "Flatbed", "color_mode": "Color", "resolution_dpi": 600 }` (or higher if device supports).

- “Scan a stack double-sided” / “Use the feeder, both sides”
  - Prefer `ADF Duplex` if available; otherwise `ADF`.
  - Example params: `{ "duplex": true, "source": "ADF Duplex", "resolution_dpi": 300, "color_mode": "Lineart" }` (adjust color/mode as requested).

- “Scan text for OCR” (upstream OCR handled elsewhere; optimize capture)
  - Prefer 300 dpi and `Gray` or `Lineart`. If unsure, `Gray` is a safe OCR choice when Lineart is too lossy.
  - Example params: `{ "resolution_dpi": 300, "color_mode": "Gray" }`.

Notes on `source` and `duplex`:
- Duplex is expressed by selecting the `ADF Duplex` source when available; `duplex: true` nudges selection toward `ADF Duplex`.
- If the user doesn’t care about feeder vs. flatbed, allow auto-selection. If they explicitly say “flatbed”, set `source: "Flatbed"`.

## What A Normal Outcome Looks Like
After `start_scan_job`, you receive `{ job_id, run_dir, state }`.
- Poll `get_job_status { job_id }` until `state` is `completed`.
- In `run_dir`, you should see:
  - `manifest.json`: job metadata, params, page and document listings.
  - `events.jsonl`: chronological events (e.g., `job_started`, `scanner_exec`, `job_completed`).
  - `page_0001.tiff`, `page_0002.tiff`, …: raw captured pages.
  - `doc_0001.tiff` (and/or assembled outputs when configured): multipage artifacts.
- A typical events sequence includes:
  - `job_started` → `scanner_exec` → (optional `scanner_failed` on retries) → `job_completed`.

## Troubleshooting Flow (When Something Goes Wrong)
1) Inspect manifest and events:
   - `get_manifest { job_id }` — confirm `state` (`error`, `running`, etc.), device/params.
   - `get_events { job_id }` — look for `scanner_failed` with structured details.
2) Examine scanner logs referenced in events:
   - The server writes `scanner.err.log` and `scanner.out.log` into the `run_dir`.
   - On failure, the server logs tails of both files and includes exit code/signal and command.
3) Common issues and responses:
   - “No devices found”: Run `list_devices`. Ensure system SANE is installed and the device is powered/connected. Use a specific `device_id` if necessary.
   - “Unsupported resolution/mode”: Use `get_device_options` and re-issue `start_scan_job` with supported values. The server also auto-normalizes when possible.
   - “Feeder jam or empty”: Switch `source` to `Flatbed` or reload the ADF; retry. Ask the user to check the feeder.
   - “Permission denied on device or tmp dir”: Verify OS permissions and `INBOX_DIR` location; set `tmp_dir` if needed.
4) Retry strategy:
   - If failure looks transient (paper jam, timeout), retry `start_scan_job` with the same params. Consider lowering dpi or switching sources.

## Operational Tips
- Device auto-selection favors ADF/duplex-capable devices and lightly prefers configured backends; it avoids camera-like backends by default.
- If the user supplies partial parameters, the server normalizes to the device’s vocabulary (e.g., case-insensitive color mode matching) and fills missing fields.
- For photo-quality tasks, explicitly choosing `Flatbed` + `Color` + highest `resolution_dpi` is recommended.


## References
- Defaults and selection logic are further documented in the [`scan-mcp` server's official repository](https://github.com/jacksenechal/scan-mcp/blob/main/docs/SELECTION.md).
- Server configuration can be fine-tuned with environment variables (including `INBOX_DIR`, `SCANIMAGE_BIN`, `SCANADF_BIN`, `TIFFCP_BIN`, `IM_CONVERT_BIN`, `SCAN_EXCLUDE_BACKENDS`, `SCAN_PREFER_BACKENDS`, `PERSIST_LAST_USED_DEVICE`). See the [The server's README](https://github.com/jacksenechal/scan-mcp/blob/main/README.md).

