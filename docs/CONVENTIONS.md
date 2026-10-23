# Conventions

This package uses a minimal Node.js + TypeScript stack. Key conventions:

## Language and tooling
- Node.js 22 LTS with ESM modules.
- TypeScript in strict mode.
- ESLint for linting (no Prettier; match the surrounding style).
- Vitest for tests; run with `npm test`.
- `tsc --noEmit` for type checks; build with `tsc`.
- Logging via Pino; validation with AJV or Zod.
- Dependencies should be installed normally rather than shimmed. Never use `any` types.

## Project structure
- `src/mcp.ts` bootstraps the MCP server.
- `src/server/` registers the MCP tools and resources; `src/http-server.ts` is the HTTP transport.
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
- Every job writes into its own `job-<uuid>` directory, so output filenames never collide.

## Configuration
- Read configuration from environment variables (supporting `.env`).
- Validate configuration using AJV or Zod before startup.

## Testing
- Unit tests mock child processes and filesystem interactions.
- Contract tests validate sample payloads against the JSON Schemas.
- Always clean up artifacts created during tests.

## Development workflow
- Run `make verify` before opening a pull request.

## Job state and cancellation
- A job's terminal state is decided in memory before any final I/O and never changes afterwards:
  an acknowledged cancel must not become a completion, and a completed or failed job rejects cancel.
- Backends report each finished page with `page_scanned`; the manifest's pages come only from
  those events and stay whatever the job's outcome. Never report an in-progress scratch file.
- Cancellation tests should block on explicit gates (not sleeps) and exercise real child-process termination.
