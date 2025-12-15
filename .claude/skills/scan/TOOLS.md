# scan-mcp Tool Reference

Complete reference for all scan-mcp MCP tools.

## Contents

- [list_devices](#list_devices)
- [get_device_options](#get_device_options)
- [start_scan_job](#start_scan_job)
- [get_job_status](#get_job_status)
- [cancel_job](#cancel_job)
- [list_jobs](#list_jobs)
- [get_manifest](#get_manifest)
- [get_events](#get_events)

---

## list_devices

Enumerate connected scanners and basic capabilities.

**Inputs**: None

**Returns**:
```json
[
  {
    "deviceId": "epson2:libusb:001:003",
    "backend": "epson2",
    "model": "Epson Perfection V550",
    "type": "scanner"
  }
]
```

**When to use**: Only when user explicitly asks for available scanners or specifies a particular scanner.

---

## get_device_options

Get detailed options (sources, resolutions, modes) for a specific device.

**Inputs**:
- `device_id` (string, required): Target device identifier

**Returns**:
```json
{
  "deviceId": "epson2:libusb:001:003",
  "sources": ["Flatbed", "ADF", "ADF Duplex"],
  "resolutions": [150, 300, 600, 1200],
  "colorModes": ["Lineart", "Gray", "Color"]
}
```

**When to use**: For troubleshooting or when user asks about scanner capabilities.

---

## start_scan_job

Begin a scanning job. **Omitting parameters triggers auto-selection and defaults.**

**Inputs** (all optional):
- `device_id` (string): Specific scanner; otherwise auto-select
- `resolution_dpi` (integer, 50-1200): Target DPI (default: 300)
- `color_mode` (string): `Lineart` | `Gray` | `Halftone` | `Color` (default: Lineart)
- `source` (string): `Flatbed` | `ADF` | `ADF Duplex` (default: ADF Duplex)
- `duplex` (boolean): Prefer ADF Duplex if available
- `page_size` (string): `Letter` | `A4` | `Legal` | `Custom`
- `custom_size_mm` (object): `{ width: number, height: number }`
- `doc_break_policy` (object): Advanced per-page splitting config
- `tmp_dir` (string): Override base directory for run_dir

**Returns**:
```json
{
  "job_id": "job-20250812-143022-abc123",
  "run_dir": "/path/to/inbox/job-20250812-143022-abc123",
  "state": "running"
}
```

**Default behavior** (when called with `{}`):
- Resolution: 300 dpi (probed and normalized)
- Color mode: Lineart → Gray → Halftone → Color (first available)
- Source: ADF Duplex → ADF → Flatbed (first available)
- Device: Auto-selected based on scoring (prefers ADF/duplex)

---

## get_job_status

Inspect job state and artifact counts.

**Inputs**:
- `job_id` (string, required): Job identifier

**Returns**:
```json
{
  "job_id": "job-20250812-143022-abc123",
  "state": "completed",
  "page_count": 5,
  "doc_count": 1,
  "run_dir": "/path/to/inbox/job-20250812-143022-abc123"
}
```

**When to use**: Poll until `state` is `completed` or `error`.

---

## cancel_job

Request job cancellation (best effort during scan loops).

**Inputs**:
- `job_id` (string, required): Job identifier

**Returns**:
```json
{
  "job_id": "job-20250812-143022-abc123",
  "state": "cancelled"
}
```

---

## list_jobs

List recent jobs from the inbox directory.

**Inputs** (optional):
- `limit` (integer, max 100): Number of jobs to return
- `state` (string): Filter by state (`running` | `completed` | `cancelled` | `error` | `unknown`)

**Returns**:
```json
[
  {
    "job_id": "job-20250812-143022-abc123",
    "state": "completed",
    "created_at": "2025-08-12T14:30:22Z"
  }
]
```

---

## get_manifest

Fetch a job's `manifest.json`.

**Inputs**:
- `job_id` (string, required): Job identifier

**Returns**: Raw manifest JSON containing:
- Job metadata (ID, state, timestamps)
- Parameters used for the scan
- Page and document listings
- Error details (if applicable)

**When to use**: To inspect job configuration, verify parameters, or check error states.

---

## get_events

Retrieve a job's `events.jsonl` log.

**Inputs**:
- `job_id` (string, required): Job identifier

**Returns**: Raw events JSONL with chronological events:
- `job_started`: Job initialization
- `scanner_exec`: Scanner command execution
- `scanner_failed`: Errors during scanning (with retry details)
- `job_completed`: Successful completion
- `job_failed`: Terminal errors

**When to use**: To debug failures, understand scan timeline, or find error details.

---

## Parameter Details

### resolution_dpi

- **Default**: 300 dpi (probed and normalized to nearest available)
- **Range**: 50-1200
- **Common values**: 150 (draft), 300 (standard), 600 (photos), 1200 (archival)

### color_mode

- **Default**: Lineart (fallback: Lineart → Gray → Halftone → Color)
- **Values**: `Lineart`, `Gray`, `Halftone`, `Color`
- **Case-insensitive**: Server normalizes to device's exact naming

### source

- **Default**: ADF Duplex (fallback: ADF Duplex → ADF → Flatbed)
- **Values**: `Flatbed`, `ADF`, `ADF Duplex`

### duplex

- **Default**: `false`
- **Effect**: When `true`, nudges source selection toward `ADF Duplex` if available

### page_size

- **Default**: None (scanner's default)
- **Values**: `Letter`, `A4`, `Legal`, `Custom`
- **Custom**: Requires `custom_size_mm: { width, height }`
