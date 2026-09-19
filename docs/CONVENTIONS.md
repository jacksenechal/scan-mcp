# Conventions

This package uses a minimal Node.js + TypeScript stack. Key conventions:

## Language and tooling
- Node.js 22 LTS with ESM modules.
- TypeScript in strict mode.
- ESLint and Prettier for linting and formatting.
- Vitest for tests; run with `npm test`.
- `tsc --noEmit` for type checks; build with `tsc`.
- Logging via Pino; validation with AJV or Zod.
- Dependencies should be installed normally rather than shimmed. Never use `any` types.

## Project structure
- `src/mcp.ts` bootstraps the MCP server.
- `src/tools/` hold tool implementations.
- `src/services/` handle system integration (e.g., SANE, TIFF assembly).
- `schemas/` contains JSON Schemas for tool contracts.
- `src/tests/` houses unit and integration tests.

## Determinism and typed contracts
- Define JSON Schemas for all tool inputs and outputs.
- Validate at boundaries and keep transformation logic pure.
- Avoid side effects outside of `src/services/`.

## Logging and error handling
- Emit structured JSON logs with run and job identifiers.
- Fail fast with descriptive errors and include relevant stderr snippets.

## Security and safety
- Never use `shell: true`; pass argv arrays to child processes.
- Normalize and sanitize all filesystem paths.
- Handle filename collisions by appending numeric suffixes (`_001`, `_002`, ...).

## Configuration
- Read configuration from environment variables (supporting `.env`).
- Validate configuration using AJV or Zod before startup.

## Testing
- Unit tests mock child processes and filesystem interactions.
- Contract tests validate sample payloads against the JSON Schemas.
- Always clean up artifacts created during tests.

## Development workflow
- Run `make verify` before opening a pull request.

## Scanner backends

Device discovery, options, and capture go through `AppContext.backend` (`sane`,
`ica`, or `mock`). Preserve SANE source mapping, carrier-sheet derivatives, and
resolution-dependent color defaults when modifying the shared job pipeline.
The native helper runs on macOS 15+ with Swift 6 strict concurrency. Its ICA
callbacks must stay on the main actor; tests under `swift-helper/Tests` require
no scanner hardware. `npm run test:swift` runs them with full Xcode.

A backend must await its asynchronous event writes before declaring completion.
Assembly errors must fail the job while preserving raw pages, never substitute
one page for a complete document. Run TypeScript and Swift contract tests when
changing helper JSON. Keep helper attribution/license files in the npm payload.

Cancellation tests should control asynchronous boundaries with explicit gates and
exercise real child-process termination. Once a terminal job outcome is chosen,
keep it immutable while persisting its manifest and event; never acknowledge a
late cancellation that completion will overwrite.
