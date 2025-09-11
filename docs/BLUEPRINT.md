# scan-mcp Blueprint

This document outlines the architecture and goals of the scan-mcp server.

## Goals and scope
- Enumerate scanners and capture pages with control over ADF, duplex, and page size.
- Support batching, document breaks, and multi-page TIFF assembly.
- Produce deterministic outputs and a manifest for downstream processing.

## System overview
- Artifacts are written under `inbox/<job_id>/`:
  - `page_*.tiff` and `doc_*.tiff` files
  - `manifest.json` and `events.jsonl`
- Clients may pass resulting TIFFs to other services (e.g., OCR) for further processing.
- Tool contracts are defined with JSON Schemas located in `schemas/`.

## Tools
- `list_devices()` → returns devices and capabilities
- `get_device_options(device_id)` → parsed output of `scanimage -A`
- `start_scan_job(config)` → `{ job_id, run_dir, state }`
- `get_job_status(job_id)` → dynamic job state and artifacts
- `cancel_job(job_id)` → request cancellation

## Resources
- `scan://jobs/<job_id>/events` — append-only JSONL event log
- `scan://jobs/<job_id>/manifest` — manifest JSON describing documents and pages

## Implementation notes
- Prefer `scanadf` for ADF capture; fallback to `scanimage --batch`.
- Assemble multipage TIFFs with `tiffcp` when available, otherwise ImageMagick `convert`.
- Document breaks: blank-page threshold, page count, or timer.
- Manifest structure defined in `schemas/manifest.schema.json`.
- Idempotency: document hash = hash of concatenated page hashes to avoid duplicates.
