# Selection and Defaults

This document describes how scan-mcp chooses devices and sane defaults when you don’t specify
every option in a `start_scan_job` request.

## Core Defaults

- Resolution: target 300 dpi (probed first; falls back to nearest available).
- Color mode: Lineart → Gray → Halftone → Color (first available in that order); at >= 600 dpi the
  order flips to Color → Gray → Halftone → Lineart.
- Source: ADF Duplex, then ADF, then the first advertised source when the device's options are probed;
  Flatbed only when no sources are probed (see "Source Choice").
- Page size: no explicit `-x/-y` unless `page_size` or `custom_size_mm` is provided.
- Output: batched TIFF pages (`--batch=page_%04d.tiff --format=tiff`).

## Device Selection

If you do not pass `device_id`, `selectDevice` scores each candidate. Scores are additive:

- Excluded: backends in `SCAN_EXCLUDE_BACKENDS` (default `v4l`) score -Infinity and are never chosen.
- Requested source contains "ADF": ADF Duplex +120, ADF +100, neither -50.
- Otherwise (no ADF preference): ADF Duplex +40, ADF +30.
- Resolution match: +10 if the device lists the desired resolution (only when `resolution_dpi` was given).
- Duplex capable (has an ADF Duplex source): +10.
- Backend preference: +5 for backends listed in `SCAN_PREFER_BACKENDS`.
- Camera penalty: -100 for `v4l` devices (applies only if `v4l` is removed from the exclude list).
- Last used: +1 if it matches the saved device ID (when `PERSIST_LAST_USED_DEVICE` is enabled).
- Tie-break: score descending, then device ID lexicographically.

A device whose options cannot be probed is skipped. If every candidate fails to probe, or the device list itself cannot be read, `start_scan_job` fails with that error. An explicit `device_id` is never replaced by a different device: if it cannot be probed, the call fails before any job is created.

If no device is eligible (empty device list, or only excluded backends), no `device_id` is set and the scanner default is used.

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
- If omitted: first available in the preference order Lineart → Gray → Halftone → Color (at >= 600 dpi,
  Color → Gray → Halftone → Lineart); otherwise the first advertised mode. The dpi used is the effective one.
- An explicit mode with no case-insensitive match is passed through unchanged.

## Source Choice

Applied to the chosen device once its options have been probed and it advertises at least one source:

- `duplex: true` requests "ADF Duplex", overriding any `source` also passed.
- Otherwise an explicit `source` is the request.
- A request is mapped to the device's own source names (`resolveSourceForDevice`):
  - Exact match with an advertised source wins.
  - "ADF": "ADF Front", else an advertised source containing "ADF" and not "Duplex", else any containing "ADF".
  - "ADF Duplex": any source containing "Duplex".
  - "Flatbed": any source containing "Flatbed".
  - Anything else: any source containing the requested string.
  - No match is an error listing the supported sources; it never silently falls back to another source.
- With no request: "ADF Duplex" if advertised, else "ADF", else the first advertised source.
- "Flatbed" is only the default when no sources are probed (no device selected, or the device advertises none).

## Practical Summary

Defaults aim for 300dpi, a feeder (duplex when available), and predictable output paths. You can override
`device_id`, `resolution_dpi`, `color_mode`, `source`, `duplex`, and `page_size`; the server validates and
normalizes your inputs against what the device supports.

