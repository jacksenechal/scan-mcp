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

Project layout
- src/server.ts — server entry + simple CLI for smoke tests
- schemas/ — JSON Schema files for tool inputs
- package.json, tsconfig.json — build and dev config

Notes
- Current implementation is a stub to allow schema-driven smoke tests. Replace stub impls in `src/server.ts` with production integrations (scanadf/scanimage, tiff assembly, SQLite persistence).
- Follow the conventions in docs/CONVENTIONS.md; see docs/BLUEPRINT.md for high-level architecture and flows.
