# scan-mcp Installation Guide for LLM Agents

This guide walks autonomous agents (e.g., Cline, Windsurf, Claude Desktop) through installing and configuring the `scan-mcp` server. The recommended invocation is `npx scan-mcp`, which always runs the latest published version without a local clone.

## Prerequisites

Make sure the host machine already provides the runtime and native tooling that `scan-mcp` expects. The server performs these checks on startup, but it is best to confirm them up front:

1. **Node.js 22 or newer** (includes `npx`). Verify with `node -v`.
2. **SANE scanner utilities** – `scanimage` is required and `scanadf` is recommended for automatic document feeders. Validate with `scanimage --version` and `scanimage -L`.
3. **TIFF assembly tool** – `tiffcp` (preferred, provided by `libtiff-tools`) or ImageMagick `convert`. Test with `tiffcp -h`.
4. **Writable inbox directory** where scan jobs can deposit artifacts (default: `~/Documents/scanned_documents/inbox`). Create it beforehand with `mkdir -p ~/Documents/scanned_documents/inbox`.

Typical Debian/Ubuntu installation:

```bash
sudo apt-get update
sudo apt-get install -y sane-utils libtiff-tools imagemagick
```

If no physical scanner is available, you can still exercise the server by setting `SCAN_MOCK=true`, which generates fake TIFFs instead of calling SANE.

## MCP Client Configuration

Add a server entry to your MCP client's configuration file (for example `~/.codeium/windsurf/mcp_config.json`, `~/.config/cline/mcp_servers.json`, or the equivalent location your client documents).

Use this exact `mcpServers` block:

```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": [
        "-y",
        "scan-mcp"
      ],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox"
      }
    }
  }
}
```

Key details:

- `"-y"` tells `npx` to run without prompting for confirmation.
- Update `INBOX_DIR` if you prefer a different destination for job artifacts.
- Set `SCAN_MOCK=true` in the `env` block when running on a machine without SANE devices.
- Additional overrides such as `SCANIMAGE_BIN`, `TIFFCP_BIN`, or `SCAN_PREFER_BACKENDS` can also be supplied inside the same `env` object when needed.

## Verification Steps

1. Ensure the inbox directory exists and is writable.
2. Run the server once in mock mode to confirm dependencies:
   ```bash
   SCAN_MOCK=true npx -y scan-mcp --help
   ```
   The command should print usage information and exit successfully.
3. Start your MCP client; it should list a `scan` server endpoint. Call `list_devices` to see detected scanners or mock devices.

## Troubleshooting

- **Missing binaries**: Install or adjust the `SCANIMAGE_BIN`, `SCANADF_BIN`, `TIFFCP_BIN`, or `IM_CONVERT_BIN` environment variables to point at the correct paths.
- **Permission errors**: Ensure the configured `INBOX_DIR` exists and the MCP client user can read/write inside it.
- **No scanners found**: Confirm `scanimage -L` returns at least one device. If not, install or troubleshoot SANE backends, or enable `SCAN_MOCK=true` for testing.
- **Large documents**: Provide `TIFFCP_BIN` (libtiff) when possible—ImageMagick `convert` is a slower fallback.

## Additional Resources

- Full project README: `https://github.com/jacksenechal/scan-mcp#readme`
- JSON Schemas for tool inputs/outputs: `schemas/`
- Environment variable reference: run `npx -y scan-mcp --help`

With these steps complete, `scan-mcp` will be available to any MCP-compatible client via `npx scan-mcp`.
