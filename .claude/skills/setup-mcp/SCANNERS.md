# Scanner Setup Guide

Device-specific scanner setup and permissions.

## Contents

- [USB Scanners](#usb-scanners)
- [Network Scanners](#network-scanners)
- [Multi-Function Printers](#multi-function-printers)
- [Scanner Permissions](#scanner-permissions)

---

## USB Scanners

### Auto-Detection

Most USB scanners work automatically with SANE once drivers are installed.

Test detection:
```bash
scanimage -L
```

### Permissions

USB scanners require permission to access `/dev/bus/usb/` devices.

**Check current groups**:
```bash
groups
```

Should include `scanner` or `lp`.

**Add user to scanner group**:
```bash
sudo usermod -a -G scanner $USER
# Log out and log back in
```

**For immediate effect** (without logout):
```bash
newgrp scanner
```

### Persistent Permissions with udev

Create udev rule for your scanner:

1. **Get vendor and product ID**:
```bash
lsusb | grep -i scanner
# Example output: Bus 001 Device 003: ID 04b8:0158 Epson Corp.
#                                      ^^^^ ^^^^
#                                      vendor product
```

2. **Create udev rule**:
```bash
sudo nano /etc/udev/rules.d/99-scanner.rules
```

3. **Add line** (replace vendor/product IDs):
```
SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", ATTR{idProduct}=="0158", MODE="0666"
```

4. **Reload udev rules**:
```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
```

---

## Network Scanners

### Configure SANE for Network Scanners

1. **Identify scanner IP**:
```bash
# Find scanner on network
nmap -p 1865,8610,8612 192.168.1.0/24
```

2. **Configure backend**:

**For Epson network scanners** (`epsonds` backend):
```bash
sudo nano /etc/sane.d/epsonds.conf
# Add line:
net 192.168.1.100
```

**For HP network scanners** (`hpaio` backend):
```bash
sudo nano /etc/sane.d/hp.conf
# Add line:
ip=192.168.1.100
```

3. **Test detection**:
```bash
scanimage -L
```

---

## Multi-Function Printers

### HP MFPs

Install HPLIP (HP Linux Imaging and Printing):

**Debian/Ubuntu**:
```bash
sudo apt-get install hplip
hp-setup
```

**Arch Linux**:
```bash
sudo pacman -S hplip
hp-setup
```

**Fedora/RHEL**:
```bash
sudo dnf install hplip
hp-setup
```

### Epson MFPs

Usually work with `epson2` or `epsonds` backends (included in sane-backends).

### Brother MFPs

May require proprietary drivers from Brother website.

### Canon MFPs

Use `pixma` backend (included in sane-backends) or proprietary drivers.

---

## Scanner Permissions

### Check Current Permissions

```bash
# Check USB device permissions
ls -la /dev/bus/usb/*/*

# Check user groups
groups
```

### Common Permission Issues

**"Permission denied" errors**:

1. **Add to scanner group** (most common fix):
```bash
sudo usermod -a -G scanner $USER
# Log out and log back in
```

2. **Check scanner group exists**:
```bash
grep scanner /etc/group
```

3. **For testing only** (not permanent):
```bash
# Run scanimage with sudo to verify permission issue
sudo scanimage -L
```

### Verify Scanner Access

```bash
# Should list scanners without sudo
scanimage -L

# Test scan (doesn't actually scan)
scanimage --test
```
