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
- Capture runs a single `scanimage --batch` command (`planScanCommand` in `src/services/backends/sane.ts`).
- Multipage TIFFs are assembled with `tiffcp`. ImageMagick `convert` is used for carrier-sheet detection and cropping, not for assembly.
- Document breaks: `page_count` splits a batch every N pages. Other break types are on the roadmap (`docs/ROADMAP.md`).
- Manifest structure defined in `schemas/manifest.schema.json`.
- Provenance: every page and assembled document carries its own sha256 in the manifest. The document hash is the hash of the assembled file; there is no de-duplication across jobs.
