# Agent Guidelines

## Build, Test, and Development Commands
- Run commands from this directory.
- `make install` installs dependencies.
- `make lint`, `make typecheck`, `make test`, `make build`, and `make verify` mirror `package.json` scripts.
- `npm test` runs the Vitest suite.
 
## Code & Project Conventions
- See [CONVENTIONS.md](./CONVENTIONS.md) for coding style, project structure, security, and testing guidelines.

## Commit & Pull Request Guidelines
- Use conventional commit prefixes when practical (`feat:`, `fix:`, `docs:`, etc.).
- Keep commits focused and run `make verify` before sending a PR.
- PRs should include a concise summary and relevant command output.

## Releases (release-please)
- This repo uses release-please to automate versioning and changelog generation.
- Do not manually bump versions in `package.json` or other manifests.
- Use conventional commits; release-please derives the next version from commit history.
- If you need to force a specific version for a PR, include a line in the merge (squash) commit message body:
  - `Release-As: x.y.z`
- CI will open or update a release PR; merging it publishes the release per the configured workflow.

## Network and Approvals Policy
- Network access is allowed for installing packages, fetching docs, or calling external APIs.
- If the sandbox blocks a command, re-run it with elevated permissions and a brief justification.
- Do not commit secrets; document required environment variables instead.

## CI Debugging
- To live-debug publish issues, use the `Debug Publish` workflow (workflow_dispatch):
  - Inputs: `ref` (tag or branch), `auth` (`trusted` or `classic`), `dry_run` (default true).
  - On failure it opens a temporary tmate SSH session restricted to the triggering actor.
- The release workflow also opens a tmate session automatically if it fails.
