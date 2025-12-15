# Advanced Configuration

Advanced setup options for scan-mcp MCP server.

## Contents

- [Local Installation](#local-installation)
- [Multiple MCP Server Configurations](#multiple-mcp-server-configurations)
- [Backend Preferences](#backend-preferences)
- [Mock Mode for Testing](#mock-mode-for-testing)
- [Custom Binary Paths](#custom-binary-paths)
- [Device Selection Control](#device-selection-control)

---

## Local Installation

For development or testing unreleased features, use local installation instead of npx.

### Prerequisites

1. Clone scan-mcp repository
2. Install dependencies and build:
```bash
cd /path/to/scan-mcp
npm install
npm run build
```

### Configuration

**MCP config** (use absolute path):
```json
{
  "mcpServers": {
    "scan": {
      "command": "node",
      "args": ["/absolute/path/to/scan-mcp/build/index.js"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox"
      }
    }
  }
}
```

**Important**:
- Replace `/absolute/path/to/scan-mcp` with actual repository path
- Must run `npm run build` after code changes

---

## Multiple MCP Server Configurations

Configure multiple scan-mcp instances with different settings:

```json
{
  "mcpServers": {
    "scan-personal": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/personal/scans"
      }
    },
    "scan-work": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/work/scans",
        "SCAN_PREFER_BACKENDS": "fujitsu"
      }
    }
  }
}
```

**Usage**: Specify which server to use in prompts: "Use scan-work to scan this"

---

## Backend Preferences

Prefer specific SANE backends when multiple scanners are available:

```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox",
        "SCAN_PREFER_BACKENDS": "epson2,fujitsu",
        "SCAN_EXCLUDE_BACKENDS": "v4l,test"
      }
    }
  }
}
```

**Environment variables**:
- `SCAN_PREFER_BACKENDS`: Comma-separated list of backends to prefer (e.g., `epson2,fujitsu`)
- `SCAN_EXCLUDE_BACKENDS`: Comma-separated list of backends to exclude (e.g., `v4l,test`)

**Use cases**:
- Exclude webcams/cameras (`v4l` backend)
- Favor specific scanner brands
- Skip test/mock devices

---

## Mock Mode for Testing

Test scan-mcp without physical scanner:

```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox",
        "SCAN_MOCK": "true"
      }
    }
  }
}
```

Mock mode generates fake TIFF files for testing workflows without hardware.

---

## Custom Binary Paths

Override scanner binary locations for custom SANE installations:

```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox",
        "SCANIMAGE_BIN": "/usr/local/bin/scanimage",
        "SCANADF_BIN": "/usr/local/bin/scanadf",
        "TIFFCP_BIN": "/opt/local/bin/tiffcp",
        "IM_CONVERT_BIN": "/usr/local/bin/convert"
      }
    }
  }
}
```

**Available overrides**:
- `SCANIMAGE_BIN` (default: `scanimage`)
- `SCANADF_BIN` (default: `scanadf`)
- `TIFFCP_BIN` (default: `tiffcp`)
- `IM_CONVERT_BIN` (default: `convert`)

---

## Device Selection Control

### Persistent Device Selection

By default, scan-mcp lightly prefers the last-used scanner. Disable this:

```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox",
        "PERSIST_LAST_USED_DEVICE": "false"
      }
    }
  }
}
```

**When to use**: If you want truly neutral device selection each time.

### Complete Example with All Options

```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox",
        "SCAN_PREFER_BACKENDS": "epson2,fujitsu",
        "SCAN_EXCLUDE_BACKENDS": "v4l,test",
        "PERSIST_LAST_USED_DEVICE": "true",
        "SCANIMAGE_BIN": "/usr/local/bin/scanimage",
        "TIFFCP_BIN": "/opt/local/bin/tiffcp"
      }
    }
  }
}
```
