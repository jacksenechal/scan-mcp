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

Real hardware smoke (use with care)
1) Ensure system deps are installed (`scanimage`/`scanadf`).
2) Export `SCAN_MOCK=0` and run:
   - node src/server.ts call /scan/start_scan_job '{}'
3) Watch `INBOX_DIR` for `job-*/page_*.tiff` and `doc_0001.tiff`; `manifest.json` and `events.jsonl` are written per job.

Project layout
- src/server.ts — server entry + simple CLI for smoke tests
- schemas/ — JSON Schema files for tool inputs
- package.json, tsconfig.json — build and dev config

Notes
- Server now routes tool calls to services in `src/services/`.
- Mock mode is on by default to enable iterative TDD without hardware.
- Next: map full ADF/duplex/page-size flags, document-break policy, and robust assembly.
- Follow the conventions in docs/CONVENTIONS.md; see docs/BLUEPRINT.md for high-level architecture and flows.
