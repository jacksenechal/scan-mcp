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

## Network and Approvals Policy
- Network access is allowed for installing packages, fetching docs, or calling external APIs.
- If the sandbox blocks a command, re-run it with elevated permissions and a brief justification.
- Do not commit secrets; document required environment variables instead.
