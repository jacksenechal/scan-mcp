# Changelog

## [0.1.1](https://github.com/jacksenechal/scan-mcp/compare/v0.1.0...v0.1.1) (2025-09-11)


### ⚠ BREAKING CHANGES

* require Node 22 LTS; drop Node 20\n\n- Default Makefiles to NODE_VERSION=22 and add .nvmrc\n- Set engines to "node": ">=22" in all packages/examples\n- Update README, AGENTS, PLAN, BLUEPRINT, CONVENTIONS, TODO to Node 22\n- Remove remaining references to Node 20 in docs

### Features

* npx-ready CLI (help/version) + tarball check; drop resource copy\n\n- Add ESM bin launcher with --help/--version for scan-mcp\n- Wire scripts/check-tarball.mjs and Makefile pack-check into verify\n- Use local npm cache for pack checks; fix lint error\n- Publish-ready npm setup for npx (prepack, files, repo metadata)\n- Remove resource copy from build; load ORIENTATION.md from resources/\n ([b0a3830](https://github.com/jacksenechal/scan-mcp/commit/b0a38307a10449265435e964da6ebf89d1422e60))
* **pr2:** improve local dev loop (eslint, Makefile), add missing schemas, config; update README and TODO ([dd22e97](https://github.com/jacksenechal/scan-mcp/commit/dd22e970687e976a9c33f67887530415317ae61c))
* rename start here tool and return full orientation ([a58a930](https://github.com/jacksenechal/scan-mcp/commit/a58a9300d493bfbc5fbb2313796bcdde093ff874))
* **scan-mcp:** add /scan/list_jobs tool, manifest/events MCP resources; tool descriptions + input schemas; prefer make targets; docs TODO updated ([ce669a8](https://github.com/jacksenechal/scan-mcp/commit/ce669a8488e79a7c8f0ac41c19faecedd336c14d))
* **scan-mcp:** add logger factory and HTTP request debug with masked auth\n\n- createLogger(): stderr in stdio, default in HTTP\n- maskAuthHeaders() for safe header logging\n- Log incoming HTTP requests, SSE start, and unknown-session POSTs\n ([ba215b3](https://github.com/jacksenechal/scan-mcp/commit/ba215b3e8f34d5f2fb64a18afeb8f778ea73017e))
* **scan-mcp:** add mockable scan pipeline, services, and local Makefile; real scan support with manifest/events and tiff assembly ([611a24b](https://github.com/jacksenechal/scan-mcp/commit/611a24b1d235f714e8768a202022a2efaad3b6a2))
* **scan-mcp:** add PERSIST_LAST_USED_DEVICE flag and gate last-used device persistence\n\n- Add config flag with default true\n- Save/load last-used device only when enabled\n- Update README\n- Update tests to include config field\n\nchore(scan-mcp): remove unused better-sqlite3 dependency\nchore: ignore local .state directories across repo ([ce90d0c](https://github.com/jacksenechal/scan-mcp/commit/ce90d0ceb2f9602e687f097996838d8e71f8d911))
* **scan-mcp:** add Streamable HTTP + SSE server and unify registration\n\n- Add src/server/register.ts to centralize tools/resources\n- Simplify stdio entry (src/mcp.ts) to use registerScanServer\n- Introduce src/http-server.ts with Express:\n  - Streamable HTTP (stateless) at POST /mcp\n  - SSE (stateful) at GET /sse and POST /messages\n  - Proper types and no stdout pollution; logs to stderr\n- Remove duplicated HTTP code from mcp.ts; delete old http-stream entry\n- Update package scripts: dev:http, start:http\n- Docs: README notes for HTTP/SSE usage and local dev\n- ESLint: fix no-explicit-any by precise type casts to node:http interfaces\n ([b87b80c](https://github.com/jacksenechal/scan-mcp/commit/b87b80c5709bad064539dc9981549c9bd550448d))
* **scan-mcp:** auto-select device/source/resolution when omitted; add make real-start-auto ([b719f3e](https://github.com/jacksenechal/scan-mcp/commit/b719f3ea34bf30645adfde2fc46143055d176770))
* **scan-mcp:** default to 300dpi via probe and log scanner exec ([1cc5a8a](https://github.com/jacksenechal/scan-mcp/commit/1cc5a8aefa09d31e9f870b937b4b6332491bb3a2))
* **scan-mcp:** enrich scan failure diagnostics with stderr/stdout tails\n\n- Log runDir, command, exit code/signal, and error details\n- Tail scanner.err/out logs into structured error payloads\n- Add job-level failure log with log paths and tails\n\nrefactor(scan-mcp): extract tailTextFile to services/file-io.ts\n\n- Shareable helper to read last N lines of a text file\n- Replace inline tail logic in jobs.ts\n\nchore(scan-mcp): replace explicit any with typed guards\n\n- Use unknown in catch with Execa/Node error type guards\n- Keep ESLint no-explicit-any satisfied while retaining clarity ([8806152](https://github.com/jacksenechal/scan-mcp/commit/880615224cacb91c457d8ac6293122babe59e0c2))
* **scan-mcp:** improve HTTP/SSE observability and client compatibility\n\n- Log HTTP requests (method, URL, masked auth) and summarize RPC (method/id/tool)\n- Log SSE session start and per-message summaries\n- Accept null values for optional inputs (start_scan_job, list_jobs)\n- Fix TypeScript lint by removing any and tightening types\n- Build + lint verified ([eee9ec0](https://github.com/jacksenechal/scan-mcp/commit/eee9ec08245c0e84bea22520ce054fe4d9bf19be))
* **scan-mcp:** Increase test coverage and update schema tests ([67ce156](https://github.com/jacksenechal/scan-mcp/commit/67ce156112714ced2322b60ff4ee4b78c307129f))
* **scan-mcp:** intelligent device selection without vendor hardcodes ([9ce27af](https://github.com/jacksenechal/scan-mcp/commit/9ce27aff6d54fc876c86859f49d19f03d7f10f86))
* **scan-mcp:** page-size mapping (-x/-y mm), duplex-aware source selection, and last-used device persistence ([3496ce7](https://github.com/jacksenechal/scan-mcp/commit/3496ce778242f724acd927fca5088ae94316f1f3))
* **scan-mcp:** plan scan commands (prefer scanadf with fallback) and implement page_count document splitting ([b7039ad](https://github.com/jacksenechal/scan-mcp/commit/b7039ad0c51908399e5d110041138c084e249285))
* **scan-mcp:** scaffold MCP stdio server using TS SDK (lazy-loaded); add dev/start scripts; document transport in blueprint ([e6d7dd0](https://github.com/jacksenechal/scan-mcp/commit/e6d7dd06b5bc02de91692daceb8b5369d2096298))
* **scan-mcp:** wire stdio MCP server using McpServer with correct SDK subpath imports; register scan tools; add restart context with next steps ([4f44ec3](https://github.com/jacksenechal/scan-mcp/commit/4f44ec326624bda6ce838080cf8ee446aeba61d9))
* **schema:** add JSON schemas for document processing and scanning resources ([cfdd47d](https://github.com/jacksenechal/scan-mcp/commit/cfdd47d5a432e3aa52dbe81875f153185fa45119))


### Bug Fixes

* **ci:** Remove nvm activation and mcptools from Makefiles and docs ([63894f7](https://github.com/jacksenechal/scan-mcp/commit/63894f771db2b044c90719bf2a138a2b17314079))
* **cli:** start server from bin and show correct version ([837d14b](https://github.com/jacksenechal/scan-mcp/commit/837d14b4e00285d64b2c60850a421dc1975ca9e5))
* sanitize job path resolution ([b8d124e](https://github.com/jacksenechal/scan-mcp/commit/b8d124e682e565fd41886fc0ef4a58e91989294d))
* **scan-mcp/http:** enable dev server with tsx and bind 0.0.0.0 ([54d21a8](https://github.com/jacksenechal/scan-mcp/commit/54d21a80191afe465a56ab3640925d62379c7a9f))
* **scan-mcp:** keep MCP stdout clean and harden child stdio ([0cd1bd9](https://github.com/jacksenechal/scan-mcp/commit/0cd1bd95f8d0cba932c11ad4797ca6c4873054a6))
* **scan-mcp:** make MCP entry type-safe for build without SDK installed; add module shims and unknown-safe handlers ([fde0596](https://github.com/jacksenechal/scan-mcp/commit/fde0596abcd709e709049d8f410136c5f8598b40))
* **scan-mcp:** Remove any and unknown types ([29759d8](https://github.com/jacksenechal/scan-mcp/commit/29759d8765a8e7cf93c0b84dae86cfee94dc763d))
* **scan-mcp:** Resolve test failures and improve mocking and test isolation. ([ff96432](https://github.com/jacksenechal/scan-mcp/commit/ff964322d9f50e6721796961e843b716c0e5ef64))


### Miscellaneous Chores

* prepare initial release ([6d07606](https://github.com/jacksenechal/scan-mcp/commit/6d0760648f284da06ebab133ffdd49bf61ecedb4))


### Build System

* require Node 22 LTS; drop Node 20\n\n- Default Makefiles to NODE_VERSION=22 and add .nvmrc\n- Set engines to "node": "&gt;=22" in all packages/examples\n- Update README, AGENTS, PLAN, BLUEPRINT, CONVENTIONS, TODO to Node 22\n- Remove remaining references to Node 20 in docs ([3da05be](https://github.com/jacksenechal/scan-mcp/commit/3da05be9954bc0ba048f7c93ea7b828d00a4e81b))

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
