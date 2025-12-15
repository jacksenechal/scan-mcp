# scan-mcp Configuration

Environment variables and configuration options for the scan-mcp MCP server.

## Contents

- [Core Configuration](#core-configuration)
- [Device Selection Tuning](#device-selection-tuning)
- [Binary Path Overrides](#binary-path-overrides)
- [Testing and Development](#testing-and-development)
- [Device Auto-Selection Details](#device-auto-selection-details)

---

## Core Configuration

### INBOX_DIR

Base directory for job runs and artifacts.

- **Default**: `scanned_documents/inbox` (relative to current directory)
- **Example**: `~/Documents/scanned_documents/inbox`
- **Note**: Directory will be created if it doesn't exist

**MCP config example**:
```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox"
      }
    }
  }
}
```

---

## Device Selection Tuning

### SCAN_EXCLUDE_BACKENDS

Comma-separated list of backends to exclude from device selection.

- **Default**: Excludes camera backends like `v4l`
- **Example**: `v4l,test`

**Use case**: Prevent auto-selection of webcams or test devices.

### SCAN_PREFER_BACKENDS

Comma-separated list of preferred backends (lightly boosted in scoring).

- **Default**: None
- **Example**: `epson2,fujitsu`

**Use case**: Favor specific scanner brands when multiple devices available.

### PERSIST_LAST_USED_DEVICE

Persist and lightly prefer last-used device.

- **Default**: `true`
- **Values**: `true` | `false`

**Use case**: Disable if you want truly neutral device selection each time.

**MCP config example**:
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
        "PERSIST_LAST_USED_DEVICE": "true"
      }
    }
  }
}
```

---

## Binary Path Overrides

Override paths to scanner and image processing binaries.

### SCANIMAGE_BIN

- **Default**: `scanimage`
- **Example**: `/usr/local/bin/scanimage`

### SCANADF_BIN

- **Default**: `scanadf`
- **Example**: `/usr/local/bin/scanadf`

### TIFFCP_BIN

- **Default**: `tiffcp`
- **Example**: `/opt/local/bin/tiffcp`

### IM_CONVERT_BIN

- **Default**: `convert`
- **Example**: `/usr/local/bin/convert`

**Use case**: Custom SANE installations or non-standard paths.

**MCP config example**:
```json
{
  "mcpServers": {
    "scan": {
      "command": "npx",
      "args": ["-y", "scan-mcp"],
      "env": {
        "INBOX_DIR": "~/Documents/scanned_documents/inbox",
        "SCANIMAGE_BIN": "/usr/local/bin/scanimage",
        "TIFFCP_BIN": "/opt/local/bin/tiffcp"
      }
    }
  }
}
```

---

## Testing and Development

### SCAN_MOCK

Mock SANE calls and generate fake TIFFs for testing.

- **Default**: `false`
- **Values**: `true` | `false`

**Use case**: Testing without physical scanner hardware.

**MCP config example**:
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

---

## Device Auto-Selection Details

When `device_id` is not specified, the server ranks candidates by:

1. **Backend exclusions**: Excludes backends in `SCAN_EXCLUDE_BACKENDS`
2. **Feeder preference**: Devices with ADF get a boost
3. **Duplex capability**: Extra points for `ADF Duplex` support
4. **Resolution match**: Small bump if device supports the desired resolution
5. **Backend preference**: Small bump for backends in `SCAN_PREFER_BACKENDS`
6. **Last used**: Light bump for the last-used device (if persistence enabled)
7. **Tie-break**: Score descending, then `deviceId` lexicographically

---

## Multiple MCP Server Configurations

You can configure multiple scan-mcp instances with different settings:

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

Then specify which server to use: "Use scan-work to scan this"
