# Platform-Specific Installation

Prerequisites installation guide by platform.

## Contents

- [Debian/Ubuntu](#debianubuntu)
- [Arch Linux](#arch-linux)
- [Fedora/RHEL/CentOS](#fedorарhelcentos)
- [macOS](#macos)
- [Verifying Installation](#verifying-installation)

---

## Debian/Ubuntu

### SANE Utilities

```bash
sudo apt-get update
sudo apt-get install sane-utils
```

### TIFF Tools

**Option 1: tiffcp (preferred)**
```bash
sudo apt-get install libtiff-tools
```

**Option 2: ImageMagick (fallback)**
```bash
sudo apt-get install imagemagick
```

### Scanner Permissions

```bash
# Add user to scanner group
sudo usermod -a -G scanner $USER

# Log out and log back in for changes to take effect
```

---

## Arch Linux

### SANE Utilities

```bash
sudo pacman -S sane
```

### TIFF Tools

```bash
sudo pacman -S libtiff
```

**Optional: ImageMagick**
```bash
sudo pacman -S imagemagick
```

### Scanner Permissions

```bash
sudo usermod -a -G scanner $USER
```

### Enable Scanner Service

For network scanners:
```bash
sudo systemctl enable saned.socket
sudo systemctl start saned.socket
```

---

## Fedora/RHEL/CentOS

### SANE Utilities

```bash
sudo dnf install sane-backends sane-backends-drivers-scanners
```

### TIFF Tools

```bash
sudo dnf install libtiff-tools
```

**Optional: ImageMagick**
```bash
sudo dnf install ImageMagick
```

### Scanner Permissions

```bash
sudo usermod -a -G scanner $USER
```

---

## macOS

### Using Homebrew

**SANE Utilities**
```bash
brew install sane-backends
```

**TIFF Tools**
```bash
brew install libtiff
```

**Optional: ImageMagick**
```bash
brew install imagemagick
```

**Note**: macOS scanner support via SANE is limited. Native drivers may work better.

---

## Verifying Installation

After installation on any platform, verify with scan-mcp preflight:

```bash
npx -y scan-mcp --preflight-only
```

**Expected output**:
```
✓ Node.js version check (22.x.x)
✓ scanimage available (/usr/bin/scanimage)
✓ TIFF tools available (tiffcp: /usr/bin/tiffcp)
All preflight checks passed!
```

**Manual verification**:
```bash
# Check SANE
scanimage --version

# Check TIFF tools
tiffcp -h

# Or check ImageMagick
convert --version
```
