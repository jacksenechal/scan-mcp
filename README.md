# scan-mcp
[![npm downloads](https://img.shields.io/npm/dm/scan-mcp.svg)](https://www.npmjs.com/package/scan-mcp)

[![CI](https://github.com/jacksenechal/scan-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/jacksenechal/scan-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/scan-mcp.svg)](https://www.npmjs.com/package/scan-mcp)
![node-current](https://img.shields.io/node/v/scan-mcp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](#license)


Minimal MCP server for scanner capture (ADF/duplex/page-size), batching, and multipage assembly.

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
      "args": ["scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox"
      }
    }
  }
}
```

- Call `start_scan_job` without a `device_id` to auto-select a scanner and begin scanning.
- Artifacts are written under `INBOX_DIR` per job: `job-*/page_*.tiff`, `doc_*.tiff`, `manifest.json`, `events.jsonl`.

## Install

- Run with npx: `npx scan-mcp`
- CLI help: `scan-mcp --help`
- Install npm: `npm i -g scan-mcp` then `scan-mcp`
- From source (development):
  - `npm install`
  - `npm run build`
  - MCP clients can run via `node dist/mcp.js` or `npx tsx src/mcp.ts`

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

## Tools

- `list_devices`: Discover connected scanners with backend details.
- `get_device_options`: Probe options for a given `device_id`.
- `start_scan_job`: Start a job (auto-selects device if omitted). Creates per-page TIFFs, assembles documents.
- `get_job_status`: Inspect job state and artifact paths.
- `cancel_job`: Request job cancellation (best-effort during scan loops).

See JSON Schemas in `schemas/` for shapes of inputs/outputs. Tests assert against these contracts.

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

## License

MIT

## Notes for Publishing

- Published as unscoped `scan-mcp` for npx convenience.
