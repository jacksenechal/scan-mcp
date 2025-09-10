# scan-mcp

Minimal MCP server for scanner capture (ADF/duplex/page-size), batching, and multipage assembly.

Purpose
- Provide a small, typed MCP server that exposes tools for device discovery and starting scan jobs.
- Validate incoming tool inputs with JSON Schema and return deterministic, typed outputs.
  

Quickstart (development)
1. Install dev deps:
   - npm install
2. Run in dev mode (stdio or HTTP):
   - Do not start the server via any `npm run …` command from an MCP client; npm prints a preamble and/or suppresses stdio, which breaks the MCP protocol.
   - For MCP clients (stdio), launch one of these directly:
     - `node /absolute/path/to/mcp/scan-mcp/dist/mcp.js`
     - `scan-mcp` (after `npm link`)
   - For HTTP/Streamable + SSE (development/testing):
     - `npm run dev:http` (express server with POST `/mcp` and GET `/sse`)
     - Build + run: `npm run build && npm run start:http`
     - Streamable HTTP (stateless): POST `http://localhost:3001/mcp`
     - SSE (stateful): GET `http://localhost:3001/sse` then POST `/messages?sessionId=...`
   - For local development only (not via MCP clients), `npm run dev` is fine in a terminal.
3. Inspect tools and call via mcptools:
   - mcp tools scan
   - mcp call list_devices scan -f pretty

Run Anywhere (CLI)
- Global install (dev):
  - npm ci && npm link  # builds via prepare and installs `scan-mcp` on PATH
- Use with mcptools:
  - mcp tools scan-mcp
  - mcp call list_devices scan-mcp -f pretty
- Without linking, you can also run directly:
  - node /absolute/path/to/mcp/scan-mcp/dist/mcp.js
  - Or from repo root: npm --prefix mcp/scan-mcp start

MCP Server Config (JSON)
- Example client config block to register this server:
```
{
  "mcpServers": {
    "scan": {
      "command": "scan-mcp",
      "args": [],
      "env": {
        "INBOX_DIR": "/home/jack/workspace/scan-agent/scanned_documents/inbox",
        "LOG_LEVEL": "info",
        "SCAN_MOCK": "0"
      }
    }
  }
}
```
- If you prefer not to use `npm link`, substitute a direct Node command:
```
{
  "mcpServers": {
    "scan": {
      "command": "node",
      "args": [
        "/home/jack/workspace/scan-agent/mcp/scan-mcp/dist/mcp.js"
      ],
      "env": { "INBOX_DIR": "/home/jack/workspace/scan-agent/scanned_documents/inbox" }
    }
  }
}
```

Environment
- `SCAN_MOCK` (default: `false`): when `true`, mock SANE calls and create fake pages/docs on `start_scan_job` for TDD. Leave as `false` to use your real scanner.
- `INBOX_DIR` (default: `scanned_documents/inbox`): base directory for job run directories and artifacts.
- `SCANIMAGE_BIN`/`SCANADF_BIN` (defaults: `scanimage`/`scanadf`): override paths to system binaries.
- `TIFFCP_BIN`/`IM_CONVERT_BIN` (defaults: `tiffcp`/`convert`): assembly tools for multipage TIFFs.
 - `SCAN_EXCLUDE_BACKENDS` (CSV): backends to exclude from selection (e.g., `v4l`).
 - `SCAN_PREFER_BACKENDS` (CSV): lightly prefer these backends when ranking (e.g., `epjitsu,epson2`).
 - `PERSIST_LAST_USED_DEVICE` (default: `true`): when `true`, save the last used `device_id` to `.state/scan-mcp.json` and lightly prefer it during auto-selection. Set to `false` to disable this persistence.

Device selection and real hardware smoke
1) Ensure system deps are installed (`scanimage`).
2) By default, when you call `start_scan_job` without a `device_id`, the server will:
   - List devices, probe options, then rank devices by feeder capability (prefers `ADF Duplex` → `ADF`), duplex, resolution match (300dpi), and avoid camera backends like `v4l`.
   - Fill missing `source`/`resolution_dpi`/`color_mode` from device options (prefers `ADF Duplex`, 300dpi, `Color`).
3) Run with auto-select via MCP:
   - mcp call start_scan_job --params '{"resolution_dpi":300}' scan -f pretty
4) Watch `INBOX_DIR` for `job-*/page_*.tiff` and `doc_*.tiff`; `manifest.json` and `events.jsonl` are written per job.

Project layout
- src/mcp.ts — MCP server entry (tools)
- src/services/ — hardware + job orchestration
- schemas/ — JSON Schemas (kept for contract docs/tests)
- package.json, tsconfig.json — build and dev config

Notes
- Server routes tool calls to services in `src/services/`.
- Mock mode default is off; set `SCAN_MOCK=1` to generate fake TIFFs for testing.
- Intelligent device selection implemented (no vendor hardcodes). Use `SCAN_EXCLUDE_BACKENDS`/`SCAN_PREFER_BACKENDS` to tune.
- Implemented page-count document splitting and multipage TIFF assembly (`tiffcp` preferred; fallback copy).
- Next: map full ADF/duplex/page-size flags, add blank-page/timer doc-break, and improve error/status details.
- Follow the conventions in docs/CONVENTIONS.md; see docs/BLUEPRINT.md for high-level architecture and flows.

## Scan Defaults and Selection Logic

Here’s how scan-mcp sets its defaults and “smart” choices.

**Core Defaults**
- Resolution: 300 dpi (probed first; falls back to nearest available, see below).
- Color mode: Lineart (then Gray → Halftone → Color if Lineart unavailable).
- Source: Flatbed (only if we can’t infer a better source from device options).
- Page size: None by default (no `-x/-y` unless you specify `page_size` or `custom_size_mm`).
- Output: Always batched TIFF pages (`--batch=page_%04d.tiff --format=tiff`).

**Device Selection**
- Intelligent pick: If you don’t pass `device_id`, we choose one via `selectDevice`:
  - Excludes: Backends in `SCAN_EXCLUDE_BACKENDS` (default: `["v4l"]`) are scored as unusable.
  - Feeder preference: Rewards devices with ADF, extra points if duplex-capable.
  - Resolution match: Small bump if the device supports the desired resolution.
  - Duplex capability: Extra points for devices with ADF Duplex.
  - Backend preference: Small bump for backends listed in `SCAN_PREFER_BACKENDS`.
  - Last used: Slight bump if it matches the last saved device.
  - Tie-break: Score desc, then `deviceId` lexicographically.
- If nothing viable (e.g., only excluded devices), we may leave `device_id` unset and rely on the system’s default device.

**Resolution Choice**
- Target: 300 dpi by default.
- Probe: Tries a non-scanning probe for 300 (`scanimage -n -d <id> --resolution 300`).
  - If supported: uses 300.
  - Otherwise: uses the nearest in the device’s advertised list:
    - If any ≤ 300: pick the highest ≤ 300.
    - Else: pick the smallest above 300.
- In mock mode (`SCAN_MOCK=true`): treats 300 as supported.

**Color Mode Choice**
- If you pass one: normalized case-insensitively to the device’s available modes.
- If you don’t: picks from preference order Lineart → Gray → Halftone → Color; else first available.

**ADF/Flatbed/Duplex Logic**
- If you set `duplex: true` and the device offers “ADF Duplex”: we pick “ADF Duplex”.
- If you don’t set `source`, but the device reports sources:
  - Prefer “ADF Duplex”, else “ADF”, else the first reported option.
- If we still can’t determine a source (e.g., we didn’t identify device options): default to “Flatbed”.

Practical summary
- Defaults aim for 300dpi, Lineart, and a feeder if available (duplex preferred). If feeder info isn’t available, falls back to Flatbed.
- Duplex isn’t a separate flag passed to `scanimage`; it’s expressed by selecting the “ADF Duplex” source when available.
- You can override any of `device_id`, `resolution_dpi`, `color_mode`, `source`, `duplex`, and `page_size`; the server normalizes your inputs against what the device supports.

## Roadmap

### Resource-based Document Access

Replace filesystem paths with MCP resource URIs (e.g., mcp://scan-mcp/jobs/{job_id}/document/1) to
enable better integration with document processing pipelines. This would allow other MCP servers to
consume scanned documents directly via ReadMcpResourceTool without filesystem coupling, improving
portability and security while enabling cleaner composition with other document processing utilities.

### Real-time Job Progress Updates

Implement streaming progress updates for long-running scan jobs instead of polling-based status
checks. For multi-page jobs (100+ pages), this would provide immediate feedback on page-by-page
progress, error notifications, and job completion events.

See: https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/progress

In a similar vein, the cancel_job tool could be replaced with the more idiomatic MCP cancellation flow:
https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/cancellation

#### Support for MacOS and Windows Sanning Backends

Currently, scan-mcp only supports Linux scanning backends via sane/scanimage.
Support for MacOS and Windows backends would be a welcome addition.
