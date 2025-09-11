# Roadmap

This document collects ideas and larger enhancements that are out of scope for the minimal server.

## Resource-based Document Access

Replace filesystem paths with MCP resource URIs (e.g., `mcp://scan-mcp/jobs/{job_id}/document/1`)
to enable tighter integration with document-processing pipelines. Other MCP servers could then
consume scanned documents via ReadMcpResourceTool without filesystem coupling, improving
portability, security, and composition.

## Real-time Job Progress Updates

Provide streaming progress for long-running jobs instead of polling. For large batches (100+ pages),
streaming would improve feedback for page-by-page progress, errors, and completion.

- Progress utility: https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/progress
- Cancellation utility (to supersede `cancel_job`):
  https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/cancellation

## Cross-platform Backends

Support macOS and Windows scanning backends in addition to Linux SANE (`scanimage`).

