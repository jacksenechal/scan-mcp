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
- Local-first transports: stdio by default to keep everything on-device, optional HTTP for your own network deployments

Requires Node 22+. Linux uses SANE (`scanimage`); macOS 15+ uses a bundled native ImageCaptureCore helper.

## Quick Start (local stdio, default)

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

- This invocation runs over stdio for a privacy-first, single-machine setup.
- Call `start_scan_job` without a `device_id` to auto-select a scanner and begin scanning.
- Artifacts are written under `INBOX_DIR` per job: `job-*/page_*.tiff`, `doc_*.tiff`, `manifest.json`, `events.jsonl`. When `crop_carrier_sheets` is set and a carrier sheet is detected, a `page_*.cropped.tiff` derivative is also written per affected page.

## Streamable HTTP transport

Prefer to attach the scanner to another machine on your network? `scan-mcp` also supports the
streamable HTTP transport:

```bash
scan-mcp --http
```

- Default port is `3001`; set `MCP_HTTP_PORT` to override (for example `MCP_HTTP_PORT=3333 scan-mcp --http`).
- Binds all interfaces (`::`) by default; set `MCP_HTTP_HOST` to restrict (for example `MCP_HTTP_HOST=127.0.0.1` when a reverse proxy fronts the server).
- HTTP responses use server-sent events (SSE) for streaming tool output; clients such as Claude Desktop and Windsurf support
  this transport.
- There is currently no authentication; this is intended for internal LAN networking

## Install

- Run with npx: `npx scan-mcp` (recommended)
  - The CLI runs a quick preflight check for Node 22+ and required scanner/image tools and prints installation hints if anything is missing.
  - See recommended server config above
- Use `npx scan-mcp --http` to launch the streamable HTTP transport when running on another machine.
- CLI help: `scan-mcp --help`
- From source (for development):
  - `npm install`
  - `npm run build`
- For Cline setup, and other automated agentic installation, see [llms-install.md](llms-install.md)

## System Requirements

- Linux: `scanimage`, `tiffcp`, and ImageMagick `convert`.
- macOS 15+: a scanner supported by Image Capture. The npm package includes a
  universal (Apple Silicon and Intel) helper for discovery, capture, and multipage
  TIFF assembly; SANE and `tiffcp` are not needed. Allow scanner/network access in
  System Settings when prompted. Install ImageMagick separately to use carrier-sheet
  detection/cropping (`brew install imagemagick`).
- Building the macOS helper from source requires Swift 6; running its tests requires
  full Xcode. See [swift-helper/README.md](swift-helper/README.md).

### macOS scanning

The existing `list_devices`, `get_device_options`, and `start_scan_job` tools work
with the native backend. Options include per-source resolutions and color modes
for multifunction scanners. Output is TIFF only: individual page files and complete
multipage documents respecting the page-count break policy. PDF/OCR and two-pass
simplex assembly are separate future proposals.

Flatbed and ADF capture support named Letter, A4, and Legal sizes when the hardware
allows them, including hardware duplex. Custom dimensions are explicitly rejected.
The default source is the feeder when available. Use `SCAN_BACKEND=sane` to retain
an existing SANE installation on macOS.

The CI/release helper is ad-hoc signed, not Developer ID signed or notarized.
See the helper README for signing configuration and the remaining hardware smoke
check before release.

## Environment Variables

- `SCAN_MOCK` (default: `false`): use the mock backend and generate fake TIFFs for testing.
- `SCAN_BACKEND` (optional): `ica` on macOS or `sane`; defaults to ICA on macOS and SANE elsewhere.
- `MCP_SCANNER_HELPER_BIN` (optional): path to a custom ICA helper; a missing override fails explicitly.
- `INBOX_DIR` (default: `scanned_documents/inbox`): base directory for job runs and artifacts.
- `SCANIMAGE_BIN` / `SCANADF_BIN` (defaults: `scanimage` / `scanadf`): override binary paths.
- `TIFFCP_BIN` (default `tiffcp`): SANE multipage assembly.
- `IM_CONVERT_BIN` (default `convert`): ImageMagick for carrier-sheet detection/cropping.
- `SCAN_EXCLUDE_BACKENDS` (CSV): backends to exclude (e.g., `v4l`).
- `SCAN_PREFER_BACKENDS` (CSV): preferred backends (e.g., `epjitsu,epson2`).
- `PERSIST_LAST_USED_DEVICE` (default: `true`): persist and lightly prefer last used device.
- `MCP_HTTP_PORT` (default: `3001`): TCP port for the HTTP transport.

## API

### Tools

- **list_devices**
  - Discover connected scanners with backend details.
  - Inputs: none.

- **get_device_options**
  - Get scanner options for a specific device.
  - Inputs:
    - `device_id` (string): Target device identifier.

- **start_scan_job**
  - Begin a scanning job; omitting `device_id` triggers auto-selection and default options.
  - Inputs (all optional unless noted):
    - `device_id` (string)
    - `resolution_dpi` (integer, 50–1200)
    - `color_mode` (`Color` | `Gray` | `Lineart`): color_mode defaults to Lineart (document-first);
      at >= 600dpi it defaults to Color, since high-dpi capture usually means artwork/photos where
      1-bit destroys information. Pass color_mode explicitly to override either default; high dpi
      is the only signal used.
    - `source` (`Flatbed` | `ADF` | `ADF Duplex`)
    - `duplex` (boolean)
    - `page_size` (`Letter` | `A4` | `Legal` | `Custom`)
    - `custom_size_mm` { `width`, `height` }
    - `doc_break_policy` { `type`, `blank_threshold`, `page_count`, `timer_ms`, `barcode_values` }
    - `output_format` (string, default `tiff`)
    - `tmp_dir` (string)
    - `crop_carrier_sheets` (boolean, default `false`): detect carrier-sheet leading-edge band and write cropped page derivatives; raw pages are kept

- **get_job_status**
  - Inspect job state and artifact counts.
  - Inputs:
    - `job_id` (string)

- **cancel_job**
  - Request cancellation during capture or assembly. Completed and failed jobs reject cancellation; repeated cancellation of a cancelled job is harmless.
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

- `npm run dev` (stdio MCP server), `npm run dev:http` (HTTP transport)
- `make verify` runs lint, typecheck, and tests
- Conventions: `docs/CONVENTIONS.md` and architecture in `docs/BLUEPRINT.md`

## Roadmap

Tracking ideas and future improvements are documented in `docs/ROADMAP.md`.
