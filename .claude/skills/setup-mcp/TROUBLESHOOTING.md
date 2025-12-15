# Setup Troubleshooting

Common issues when setting up scan-mcp MCP server.

## Contents

- [Configuration Issues](#configuration-issues)
- [Preflight Failures](#preflight-failures)
- [Scanner Detection Issues](#scanner-detection-issues)
- [MCP Server Issues](#mcp-server-issues)
- [Diagnostic Commands](#diagnostic-commands)

---

## Configuration Issues

### "No MCP servers configured" After Setup

**After adding scan-mcp to config.json:**

**Causes**:
1. Claude Code not restarted
2. Config file in wrong location
3. Invalid JSON syntax
4. Permissions issue

**Solutions**:

1. **Verify file location and contents**:
```bash
cat ~/.config/claude/config.json
```

2. **Check JSON syntax**:
```bash
cat ~/.config/claude/config.json | jq .
```

3. **Verify permissions**:
```bash
ls -la ~/.config/claude/config.json
# Should be readable by user
```

4. **Ensure restart**:
- Fully exit Claude Code
- Restart it
- Run `/mcp` again

### Config Changes Not Taking Effect

**Symptoms**: Edited config.json, restarted Claude Code, changes not reflected.

**Solutions**:

1. **Verify you edited the correct file**:
```bash
find ~ -name "config.json" -path "*/claude/*" 2>/dev/null
```

2. **Check for JSON syntax errors**:
```bash
cat ~/.config/claude/config.json | jq .
```

3. **Ensure proper JSON structure**:
- `mcpServers` must be an object
- Server entries must have `command`, `args`
- No trailing commas
- Proper quotes around strings

### Finding Config File

**Check default location**:
```bash
ls -la ~/.config/claude/config.json
```

**Check XDG config**:
```bash
echo $XDG_CONFIG_HOME
ls -la $XDG_CONFIG_HOME/claude/config.json
```

**Search for Claude config**:
```bash
find ~ -name "config.json" -path "*/claude/*" 2>/dev/null
```

---

## Preflight Failures

### "scanimage not found"

**Issue**: Scanner backend not installed.

**Solution**: Install SANE utilities (see [PLATFORMS.md](PLATFORMS.md)).

### "No TIFF tools found"

**Issue**: Neither tiffcp nor ImageMagick convert found.

**Solution**: Install either libtiff-tools (preferred) or ImageMagick:

**Debian/Ubuntu**:
```bash
sudo apt-get install libtiff-tools
# Or
sudo apt-get install imagemagick
```

See [PLATFORMS.md](PLATFORMS.md) for other platforms.

### "Node.js version too low"

**Issue**: scan-mcp requires Node.js 22+.

**Solution**: Claude Code already requires Node 22+, but verify:
```bash
node --version
```

---

## Scanner Detection Issues

### "scanimage -L" Shows No Devices

**Causes**:
1. Scanner not powered on or connected
2. User lacks permissions
3. SANE can't see the scanner
4. Wrong backend needed

**Solutions**:

1. **Check physical connection**:
- Ensure scanner is powered on
- USB cable properly connected
- For network scanners, verify network connectivity

2. **Check permissions**:
```bash
# Check current groups
groups
# Should include 'scanner' or 'lp'

# If not, add user to scanner group:
sudo usermod -a -G scanner $USER
# Log out and log back in
```

3. **Test USB device visibility**:
```bash
lsusb | grep -i scanner
# Or more generically
lsusb
```

4. **Check SANE backends**:
```bash
# List available backends
scanimage -L

# Force specific backend (if known)
scanimage -L --device-name=epson2:libusb:001:003
```

5. **Enable backend explicitly**:

Edit `/etc/sane.d/dll.conf` and uncomment your scanner's backend:
```bash
sudo nano /etc/sane.d/dll.conf
# Uncomment line for your scanner (e.g., 'epson2', 'fujitsu', 'hpaio')
```

See [SCANNERS.md](SCANNERS.md) for more scanner-specific setup.

---

## MCP Server Issues

### MCP Server Starts But Tools Don't Work

**Symptoms**:
- `/mcp` shows scan server
- But `list_devices` or `start_scan_job` fails

**Causes**:
1. INBOX_DIR not writable
2. Scanner permissions issue
3. Missing dependencies

**Solutions**:

1. **Verify INBOX_DIR**:
```bash
# Check if directory exists and is writable
ls -la ~/Documents/scanned_documents/

# Create if needed
mkdir -p ~/Documents/scanned_documents/inbox

# Test write permission
touch ~/Documents/scanned_documents/inbox/test.txt
rm ~/Documents/scanned_documents/inbox/test.txt
```

2. **Check scanner access manually**:
```bash
scanimage -L
# Should list devices

# Try test scan
scanimage --test
```

3. **Review MCP server logs**: Claude Code may log MCP server errors.

---

## Diagnostic Commands

**Check SANE installation**:
```bash
scanimage --version
scanimage -L
```

**Check TIFF tools**:
```bash
tiffcp -h
convert --version
```

**Check Node.js version**:
```bash
node --version
```

**Run scan-mcp preflight**:
```bash
npx -y scan-mcp --preflight-only
```

**Verify Claude Code MCP config**:
```bash
cat ~/.config/claude/config.json | jq .
```

**List MCP servers** (from within Claude Code):
```
/mcp
```

**Test scanner manually**:
```bash
# List devices
scanimage -L

# Test scan (doesn't actually scan)
scanimage --test

# Quick actual scan (if device known)
scanimage -d 'device_id_here' --format=tiff > test.tiff
```
