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

Note: This package targets Node 22 and Linux SANE backends (`scanimage`).

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
- Artifacts are written under `INBOX_DIR` per job: `job-*/page_*.tiff`, `doc_*.tiff`, `manifest.json`, `events.jsonl`.

## Streamable HTTP transport

Prefer to keep the scanner attached to another machine while still avoiding any cloud round-trips? `scan-mcp` exposes the
streamable HTTP transport as a first-class option:

```bash
scan-mcp --http
```

- Default port is `3001`; set `MCP_HTTP_PORT` to override (for example `MCP_HTTP_PORT=3333 scan-mcp --http`).
- The server still reads and writes entirely on the host where it runs—no remote storage or relays.
- HTTP responses use server-sent events (SSE) for streaming tool output; clients such as Claude Desktop and Windsurf support
  this transport.

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
- `MCP_HTTP_PORT` (default: `3001`): TCP port for the HTTP transport.

## Raspberry Pi / detached Linux over HTTP

Many workflows keep the scanner plugged into a low-power machine (Raspberry Pi, Intel NUC, home server) tucked away in another
room. Run `scan-mcp` directly on that hardware and connect to it over your LAN while keeping every scan on devices you control.

1. Install the prerequisites (`node >= 22`, SANE, TIFF tooling) on the detached machine. Consider enabling `systemd` or `tmux`
   so the process stays alive when you disconnect.
2. Start the HTTP transport where the scanner is attached:

   ```bash
   INBOX_DIR=/mnt/scans/inbox MCP_HTTP_PORT=3001 scan-mcp --http
   ```

3. On your desktop, point your MCP client at the HTTP endpoint. Claude Desktop-style configuration:

   ```json
   {
     "mcpServers": {
       "scan-remote": {
         "transport": {
           "type": "http",
           "url": "http://raspberrypi.local:3001/mcp"
         },
         "env": {
           "SCAN_MOCK": "false"
         }
       }
     }
   }
   ```

This keeps capture, processing, and storage on your local machines—the MCP client simply streams tool calls over HTTP on your
network.

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

- `npm run dev` (stdio MCP server), `npm run dev:http` (HTTP transport)
- `make verify` runs lint, typecheck, and tests
- Conventions: `docs/CONVENTIONS.md` and architecture in `docs/BLUEPRINT.md`

## Roadmap

Tracking ideas and future improvements are documented in `docs/ROADMAP.md`.
