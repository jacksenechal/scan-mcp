# scan-mcp

Minimal MCP server scaffold for scanner capture (ADF/duplex/page-size), batching, and multipage assembly.

Purpose
- Provide a small, typed MCP server that exposes tools for device discovery and starting scan jobs.
- Validate incoming tool inputs with JSON Schema and return deterministic, typed outputs.
- Include a minimal CLI surface for local smoke tests.

Quickstart (development)
1. Install dev deps:
   - npm install
2. Run in dev mode:
   - npm run dev
3. List available tools:
   - node src/server.ts list
4. Call a tool (example):
   - node src/server.ts call /scan/list_devices '{}'

Environment
- `SCAN_MOCK` (default: `true`): when `true`, mock SANE calls and create fake pages/docs on `start_scan_job` for TDD. Set to `false` to use your real scanner.
- `INBOX_DIR` (default: `scanned_documents/inbox`): base directory for job run directories and artifacts.
- `SCANIMAGE_BIN`/`SCANADF_BIN` (defaults: `scanimage`/`scanadf`): override paths to system binaries.
- `TIFFCP_BIN`/`IM_CONVERT_BIN` (defaults: `tiffcp`/`convert`): assembly tools for multipage TIFFs.
 - `SCAN_EXCLUDE_BACKENDS` (CSV): backends to exclude from selection (e.g., `v4l`).
 - `SCAN_PREFER_BACKENDS` (CSV): lightly prefer these backends when ranking (e.g., `epjitsu,epson2`).

Device selection and real hardware smoke
1) Ensure system deps are installed (`scanimage`/`scanadf`).
2) By default, when you call `start_scan_job` without a `device_id`, the server will:
   - List devices, probe options, then rank devices by feeder capability (prefers `ADF Duplex` → `ADF`), duplex, resolution match (300dpi), and avoid camera backends like `v4l`.
   - Fill missing `source`/`resolution_dpi`/`color_mode` from device options (prefers `ADF Duplex`, 300dpi, `Color`).
3) Run with auto-select:
   - node dist/server.js call /scan/start_scan_job '{}'
   - Or via Makefile: `make real-start` or `make real-start-auto`
4) Watch `INBOX_DIR` for `job-*/page_*.tiff` and `doc_*.tiff`; `manifest.json` and `events.jsonl` are written per job.

Project layout
- src/server.ts — server entry + simple CLI for smoke tests
- schemas/ — JSON Schema files for tool inputs
- package.json, tsconfig.json — build and dev config

Notes
- Server routes tool calls to services in `src/services/`.
- Mock mode is on by default to enable iterative TDD without hardware.
- Intelligent device selection implemented (no vendor hardcodes). Use `SCAN_EXCLUDE_BACKENDS`/`SCAN_PREFER_BACKENDS` to tune.
- Implemented page-count document splitting and multipage TIFF assembly (`tiffcp` preferred; fallback copy).
- Next: map full ADF/duplex/page-size flags, add blank-page/timer doc-break, and improve error/status details.
- Follow the conventions in docs/CONVENTIONS.md; see docs/BLUEPRINT.md for high-level architecture and flows.
