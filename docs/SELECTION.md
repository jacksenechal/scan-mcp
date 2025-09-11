# Selection and Defaults

This document describes how scan-mcp chooses devices and sane defaults when you don’t specify
every option in a `start_scan_job` request.

## Core Defaults

- Resolution: target 300 dpi (probed first; falls back to nearest available).
- Color mode: Lineart → Gray → Halftone → Color (first available in that order).
- Source: prefer feeder; otherwise Flatbed if no better inference is possible.
- Page size: no explicit `-x/-y` unless `page_size` or `custom_size_mm` is provided.
- Output: batched TIFF pages (`--batch=page_%04d.tiff --format=tiff`).

## Device Selection

If you do not pass `device_id`, `selectDevice` ranks candidates:

- Excludes: backends in `SCAN_EXCLUDE_BACKENDS` (default excludes camera backends like `v4l`).
- Feeder preference: devices with ADF get a boost; duplex-capable get extra points.
- Resolution match: small bump if the device supports the desired resolution.
- Duplex capability: extra points for devices with an ADF Duplex source.
- Backend preference: small bump for entries listed in `SCAN_PREFER_BACKENDS`.
- Last used: light bump if it matches the saved device ID (when persistence enabled).
- Tie-break: score descending, then `deviceId` lexicographically.

If no viable devices remain (e.g., only excluded backends), the system’s default may be used.

## Resolution Choice

- Target: 300 dpi by default.
- Probe: `scanimage -n -d <id> --resolution 300` to avoid scanning during capability check.
  - If supported: use 300.
  - Otherwise: choose the nearest in the advertised list:
    - If any ≤ 300: pick the highest ≤ 300.
    - Else: pick the smallest above 300.
- In mock mode (`SCAN_MOCK=true`): treat 300 as supported.

## Color Mode Choice

- If provided: normalized (case-insensitively) to the device’s available modes.
- If omitted: use preference order Lineart → Gray → Halftone → Color; otherwise first available.

## ADF/Flatbed/Duplex Logic

- If `duplex: true` and device offers “ADF Duplex”: pick “ADF Duplex”.
- If `source` not set but device reports sources:
  - Prefer “ADF Duplex”, else “ADF”, else the first reported option.
- If no source can be inferred: default to “Flatbed”.

## Practical Summary

Defaults aim for 300dpi, a feeder (duplex when available), and predictable output paths. You can override
`device_id`, `resolution_dpi`, `color_mode`, `source`, `duplex`, and `page_size`; the server validates and
normalizes your inputs against what the device supports.

