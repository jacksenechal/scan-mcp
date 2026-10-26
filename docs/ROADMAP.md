# Roadmap

This document collects ideas and future work for scan-mcp.

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

## More Document Break Policies

`doc_break_policy` splits a batch only by page count. Other ways to split a mixed stack:

- Blank separator page: start a new document after a page whose ink coverage is below a threshold.
  The most useful of the three, and cheap given the existing carrier-sheet image analysis.
- Barcode separator sheet (patch codes): needs a barcode-decoding dependency.
- Feed timer: start a new document after a pause in feeding. Doesn't fit `scanimage --batch`,
  which ends the batch when the feeder runs dry.

## Cross-platform Backends

Support macOS and Windows scanning backends in addition to Linux SANE (`scanimage`).

