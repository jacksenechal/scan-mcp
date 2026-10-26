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
- zod-validated inputs; zod is the single source of truth, published as JSON Schema through `tools/list` and contract-tested (`src/tests/contract.spec.ts`)
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
- Artifacts are written under `INBOX_DIR` per job: `job-*/page_*.tiff`, `doc_*.tiff`, `manifest.json`, `events.jsonl`. When `crop_carrier_sheets` is set and a carrier sheet is detected, a `page_*.cropped.tiff` derivative is also written per affected page.

## Shutdown
On SIGINT or SIGTERM (and, over stdio, when the client closes stdin), the server cancels every running job, waits up to 5 s for the scanner processes to be killed and the manifests to be written (jobs end as `cancelled`), then exits. A second signal exits immediately.

## Streamable HTTP transport

Prefer to attach the scanner to another machine on your network? `scan-mcp` also supports the
streamable HTTP transport:

```bash
scan-mcp --http
```

- Default port is `3001`; set `MCP_HTTP_PORT` to override (for example `MCP_HTTP_PORT=3333 scan-mcp --http`).
- Binds `127.0.0.1` by default. Set `MCP_HTTP_HOST` to expose it on other interfaces (for example `MCP_HTTP_HOST=::` for all, or a LAN address); the server has no authentication, so only do that on a trusted network.
- HTTP responses use server-sent events (SSE) for streaming tool output; clients such as Claude Desktop and Windsurf support
  this transport.
- There is currently no authentication; widen the bind address only on a trusted internal network.

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

- Linux with SANE utilities: `scanimage`
- TIFF tools: `tiffcp` (multipage assembly) and ImageMagick `convert` (carrier-sheet detection and cropping); preflight requires both

## Environment Variables

- `SCAN_MOCK` (default: `false`): mock SANE calls and generate fake TIFFs for testing.
- `INBOX_DIR` (default: `scanned_documents/inbox`): base directory for job runs and artifacts.
- `SCANIMAGE_BIN` (default: `scanimage`): override the binary path.
- `TIFFCP_BIN` / `IM_CONVERT_BIN` (defaults: `tiffcp` / `convert`): multipage assembly and image analysis tools.
- `SCAN_EXCLUDE_BACKENDS` (CSV): backends to exclude (e.g., `v4l`).
- `SCAN_PREFER_BACKENDS` (CSV): preferred backends (e.g., `epjitsu,epson2`).
- `PERSIST_LAST_USED_DEVICE` (default: `true`): persist and lightly prefer last used device.
- `LOG_LEVEL` (default: `info`): pino log level.
- `MCP_HTTP_PORT` (default: `3001`): TCP port for the HTTP transport.
- `MCP_HTTP_HOST` (default: `127.0.0.1`): bind address for the HTTP transport.

## API

### Tools

- **list_devices**
  - Discover connected scanners with backend details.
  - Returns an error result (`isError: true`) if `scanimage` fails or is missing; an empty list means no scanners were found.
  - Inputs: none.

- **get_device_options**
  - Get SANE options for a specific device. Returns an error result if the device cannot be probed.
  - Inputs:
    - `device_id` (string): Target device identifier.

- **start_scan_job**
  - Begin a scanning job; omitting `device_id` triggers auto-selection and default options.
  - Returns `{ job_id, run_dir, state }`. If the job ends in `error`, the result has `isError: true` and the same body plus an `error` reason. A `cancelled` job is not an error.
  - Fails with an error result, and creates no job, if the device list cannot be read (auto-selection) or an explicit `device_id` cannot be probed. It never falls back to a different device.
  - One scan at a time per device: if the resolved device already has a running job, the call fails with an error result `device <id> is busy with job <job_id>` and creates no job. Auto-selection does not pick another device when the best one is busy. Other devices are unaffected; retry once the running job ends.
  - Cancelling the request (the client's MCP `notifications/cancelled`) or dropping the connection (HTTP disconnect, stdio client exit) cancels the job like `cancel_job`: the scanner process is terminated and the job ends as `cancelled`.
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
    - `doc_break_policy` { `type` (`page_count` | `none`), `page_count` }: split the batch into documents of `page_count` pages
    - `output_format` (string, default `tiff`)
    - `tmp_dir` (string): subdirectory of `INBOX_DIR` to place the job in. Relative paths resolve against `INBOX_DIR`; an absolute path must already be inside it. Paths that resolve outside the inbox (`..`, or symlinks pointing out) are rejected, and nothing is created. Pass the same `tmp_dir` to the lookup tools below to reach the job.
    - `crop_carrier_sheets` (boolean, default `false`): detect carrier-sheet leading-edge band and write cropped page derivatives; raw pages are kept

- **get_job_status**
  - Inspect job state and artifact counts.
  - A job ends as `completed`, `cancelled`, or `error`. A scan that produces no pages is `error`. If TIFF assembly (`tiffcp`) fails, the job is `error` and the raw `page_NNNN.tiff` files are kept; no partial document is substituted.
  - Inputs:
    - `job_id` (string)
    - `tmp_dir` (string, optional): the `tmp_dir` the job was started with

- **cancel_job**
  - Cancel a running job. The scanner process is terminated (SIGTERM, then SIGKILL if it ignores it) and the job ends as `cancelled`. Pages already completed are kept on disk and listed in the manifest, as they are for a job that ends in `error`.
  - Returns `{ ok: true }` once the cancel is accepted (`get_job_status` may show `running` briefly, until the scanner process exits); repeating it on a cancelled job is harmless. Returns `{ ok: false, error }` (as an error result, `isError: true`) if the job has already `completed` or ended in `error`, or does not exist.
  - Inputs:
    - `job_id` (string)
    - `tmp_dir` (string, optional): the `tmp_dir` the job was started with

- **list_jobs**
  - List recent jobs from the inbox directory.
  - Inputs (optional):
    - `limit` (integer, max 100)
    - `state` (`running` | `completed` | `cancelled` | `error` | `unknown`)
    - `tmp_dir` (string): list jobs under this subdirectory of `INBOX_DIR` instead of the inbox itself

- **get_manifest**
  - Fetch a job's `manifest.json`.
  - Inputs:
    - `job_id` (string)
    - `tmp_dir` (string, optional): the `tmp_dir` the job was started with

- **get_events**
  - Retrieve a job's `events.jsonl` log.
  - Inputs:
    - `job_id` (string)
    - `tmp_dir` (string, optional): the `tmp_dir` the job was started with

The `scan://jobs/{job_id}/manifest` and `scan://jobs/{job_id}/events` resources only cover jobs directly in `INBOX_DIR`. For jobs started with `tmp_dir`, use the tools above with `tmp_dir`.

Input shapes are defined by zod (`src/server/register.ts`) and published as JSON Schema through MCP `tools/list`. The on-disk `manifest.json` format is `ManifestSchema` in `src/services/manifest.ts`.

## How Selection and Defaults Work

Defaults aim for 300dpi, reasonable color mode, and ADF/duplex when available. Full details on scoring and fallbacks live in docs:

- Selection and defaults: `docs/SELECTION.md`

## Project Layout

- `src/mcp.ts` — MCP server entry and tool registration
- `src/services/*` — hardware interface and job orchestration
- `docs/` — architecture, conventions, and deep dives

## Development

- `npm run dev` (stdio MCP server), `npm run dev:http` (HTTP transport)
- `make verify` runs lint, typecheck, and tests
- Conventions: `docs/CONVENTIONS.md` and architecture in `docs/BLUEPRINT.md`

## Roadmap

Tracking ideas and future improvements are documented in `docs/ROADMAP.md`.
