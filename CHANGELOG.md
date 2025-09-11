# Changelog

## 0.1.1 (2025-09-11)

- Fix the CLI launcher so the MCP server actually starts and MCP initialization no longer times out

## 0.1.0 (2025-09-11)

Initial public release (0.1.0)

Highlights
- Minimal, typed MCP server for scanner capture (ADF/duplex/page-size), batching, and multipage assembly
- Deterministic JSON Schema–validated tool contracts with typed outputs
- Sensible device selection defaults; avoids camera backends and prefers ADF/duplex when available
- Mockable scan pipeline for CI and local development (SCAN_MOCK)
- CLI and npx entrypoint for quick usage (`npx scan-mcp`)

Stability
- Version 0.x: APIs may evolve; breaking changes may occur between minors. We’ll stabilize before 1.0.0.

Docs
- Quick start, environment variables, and tool reference in README; deeper details in docs/

