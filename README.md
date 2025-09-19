<p align="center">
  <img src="docs/assets/icon.png" alt="scan-mcp logo" width="96">
</p>

<h1 align="center">scan-mcp</h1>


[![CI](https://github.com/jacksenechal/scan-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jacksenechal/scan-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/scan-mcp.svg)](https://www.npmjs.com/package/scan-mcp)
![node-current](https://img.shields.io/node/v/scan-mcp)
[![npm downloads](https://img.shields.io/npm/dm/scan-mcp.svg)](https://www.npmjs.com/package/scan-mcp)


Minimal MCP server for scanner capture (ADF/duplex/page-size), batching, and multipage assembly.

## Features

- Small, typed MCP server exposing tools for device discovery and scan jobs
- JSON Schema–validated inputs with deterministic, typed outputs
- Smart device selection (prefers ADF/duplex, avoids camera backends), robust defaults

Note: This package targets Node 22 and Linux SANE backends (`scanimage`).

## Quick Start (MCP client config)

Add a server entry to your MCP client configuration:

```
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": [
        "-y",
        "scan-mcp"
      ],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox"
      }
    }
  }
}
```

- Call `start_scan_job` without a `device_id` to auto-select a scanner and begin scanning.
- Artifacts are written under `INBOX_DIR` per job: `job-*/page_*.tiff`, `doc_*.tiff`, `manifest.json`, `events.jsonl`.

## MCP Resources

Each scan job also publishes MCP resource URIs so clients can retrieve artifacts without direct filesystem access:

- Manifest JSON: `mcp://scan-mcp/jobs/{job_id}/manifest`
- Events log (NDJSON): `mcp://scan-mcp/jobs/{job_id}/events`
- Individual page TIFF: `mcp://scan-mcp/jobs/{job_id}/page/{page_index}`
- Assembled document TIFF: `mcp://scan-mcp/jobs/{job_id}/document/{document_index}`

Use the MCP `read_resource` utility (or equivalent client API) to request these URIs. Text resources return UTF-8 JSON payloads,
while page and document resources expose base64-encoded TIFF blobs (`mimeType: "image/tiff"`). Tool fallbacks (`get_manifest`,
`get_events`) remain available for clients that do not support resources yet.

## Install

- Run with npx: `npx scan-mcp` (recommended)
  - The CLI runs a quick preflight check for Node 22+ and required scanner/image tools and prints installation hints if anything is missing.
  - See recommended server config above
- CLI help: `scan-mcp --help`
- From source (for development):
  - `npm install`
  - `npm run build`
- For Cline setup, and other automated agentic installation, see [llms-install.md](llms-install.md)

## System Requirements

- Linux with SANE utilities: `scanimage` (and optionally `scanadf`)
- TIFF tools: `tiffcp` (preferred) or ImageMagick `convert`

## Environment Variables

- `SCAN_MOCK` (default: `false`): mock SANE calls and generate fake TIFFs for testing.
- `INBOX_DIR` (default: `scanned_documents/inbox`): base directory for job runs and artifacts.
- `SCANIMAGE_BIN` / `SCANADF_BIN` (defaults: `scanimage` / `scanadf`): override binary paths.
- `TIFFCP_BIN` / `IM_CONVERT_BIN` (defaults: `tiffcp` / `convert`): multipage assembly tools.
- `SCAN_EXCLUDE_BACKENDS` (CSV): backends to exclude (e.g., `v4l`).
- `SCAN_PREFER_BACKENDS` (CSV): preferred backends (e.g., `epjitsu,epson2`).
- `PERSIST_LAST_USED_DEVICE` (default: `true`): persist and lightly prefer last used device.

## API

### Tools

- **list_devices**
  - Discover connected scanners with backend details.
  - Inputs: none.

- **get_device_options**
  - Get SANE options for a specific device.
  - Inputs:
    - `device_id` (string): Target device identifier.

- **start_scan_job**
  - Begin a scanning job; omitting `device_id` triggers auto-selection and default options.
  - Inputs (all optional unless noted):
    - `device_id` (string)
    - `resolution_dpi` (integer, 50–1200)
    - `color_mode` (`Color` | `Gray` | `Lineart`)
    - `source` (`Flatbed` | `ADF` | `ADF Duplex`)
    - `duplex` (boolean)
    - `page_size` (`Letter` | `A4` | `Legal` | `Custom`)
    - `custom_size_mm` { `width`, `height` }
    - `doc_break_policy` { `type`, `blank_threshold`, `page_count`, `timer_ms`, `barcode_values` }
    - `output_format` (string, default `tiff`)
    - `tmp_dir` (string)

- **get_job_status**
  - Inspect job state and artifact counts.
  - Inputs:
    - `job_id` (string)

- **cancel_job**
  - Request job cancellation; best effort during scan loops.
  - Inputs:
    - `job_id` (string)

- **list_jobs**
  - List recent jobs from the inbox directory.
  - Inputs (optional):
    - `limit` (integer, max 100)
    - `state` (`running` | `completed` | `cancelled` | `error` | `unknown`)

- **get_manifest**
  - Fetch a job's `manifest.json`.
  - Inputs:
    - `job_id` (string)

- **get_events**
  - Retrieve a job's `events.jsonl` log.
  - Inputs:
    - `job_id` (string)

See JSON Schemas in `schemas/` for input shapes. Tests assert against these contracts.

## How Selection and Defaults Work

Defaults aim for 300dpi, reasonable color mode, and ADF/duplex when available. Full details on scoring and fallbacks live in docs:

- Selection and defaults: `docs/SELECTION.md`

## Project Layout

- `src/mcp.ts` — MCP server entry and tool registration
- `src/services/*` — hardware interface and job orchestration
- `schemas/` — JSON Schemas used for validation and tests
- `docs/` — architecture, conventions, and deep dives

## Development

- `npm run dev` (stdio MCP server), `npm run dev:http` (experimental HTTP)
- `make verify` runs lint, typecheck, and tests
- Conventions: `docs/CONVENTIONS.md` and architecture in `docs/BLUEPRINT.md`

## Roadmap

Tracking ideas and future improvements are documented in `docs/ROADMAP.md`.
