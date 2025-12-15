# Troubleshooting scan-mcp

Systematic troubleshooting guide for scan failures and issues.

## Contents

- [Troubleshooting Flow](#troubleshooting-flow)
- [Common Issues](#common-issues)
- [Retry Strategies](#retry-strategies)
- [Diagnostic Commands](#diagnostic-commands)

---

## Troubleshooting Flow

When a scan fails or behaves unexpectedly:

### Step 1: Inspect Manifest and Events

**Get the manifest**:
```javascript
const manifest = await get_manifest({ job_id });
```

Check:
- `state`: Is it `error`, `cancelled`, or stuck in `running`?
- `params`: Were the parameters applied correctly?
- `device`: Which device was selected?

**Get the events**:
```javascript
const events = await get_events({ job_id });
```

Look for `scanner_failed` events with:
- `exit_code`: Scanner process exit code
- `signal`: Signal that terminated the process (if any)
- `command`: Exact scanner command executed
- `stderr_tail`: Last lines of error output

### Step 2: Examine Scanner Logs

The server writes logs to the `run_dir`:
- `scanner.out.log`: Standard output from scanner command
- `scanner.err.log`: Error output from scanner command

Events include tails of both files on failure.

### Step 3: Apply Solutions

See [Common Issues](#common-issues) below for specific error patterns and fixes.

### Step 4: Retry if Appropriate

See [Retry Strategies](#retry-strategies) for transient failures.

---

## Common Issues

### "No devices found"

**Symptoms**: `list_devices` returns empty array or `start_scan_job` fails with device error.

**Solutions**:
1. Ask user to verify scanner is powered on and connected (USB/network)
2. Check if SANE is installed: User should verify with `scanimage -L`
3. Verify USB permissions (user may need to be in `scanner` or `lp` group)
4. Try specifying a device explicitly if auto-selection fails

---

### "Unsupported resolution/mode"

**Symptoms**: Scanner rejects the resolution or color mode.

**Solutions**:
1. Server auto-normalizes when possible, but check device capabilities:
   ```javascript
   const options = await get_device_options({ device_id });
   ```
2. Re-issue `start_scan_job` with a supported value from `options`
3. If not using `device_id`, trust auto-selection (it will pick supported values)

---

### "Feeder jam or empty"

**Symptoms**: Events show `scanner_failed` with feeder-related errors.

**Solutions**:
1. Ask user to check the ADF for paper jams or empty tray
2. Suggest reloading paper and retrying
3. If issue persists, switch to flatbed:
   ```javascript
   await start_scan_job({ source: "Flatbed" });
   ```

---

### "Permission denied on device or tmp_dir"

**Symptoms**: Events show permission errors accessing scanner device or writing to `run_dir`.

**Solutions**:
1. User needs permissions to access scanner device
2. Check `INBOX_DIR` location and permissions
3. Try setting `tmp_dir` to a location with write access:
   ```javascript
   await start_scan_job({ tmp_dir: "/tmp/scans" });
   ```

---

### "Job stuck in 'running' state"

**Symptoms**: `get_job_status` shows `state: "running"` indefinitely.

**Solutions**:
1. Cancel the job: `await cancel_job({ job_id })`
2. Check if scanner process is hung (examine logs)
3. Ask user to power cycle the scanner and retry

---

### "Wrong device selected"

**Symptoms**: Server selected unexpected device.

**Solutions**:
1. Explicitly specify device:
   ```javascript
   const devices = await list_devices();
   // User selects desired device
   await start_scan_job({ device_id: devices[0].deviceId });
   ```
2. Or configure backend preferences in server config (see CONFIG.md)

---

### "Low quality or wrong color mode"

**Symptoms**: Output quality doesn't match expectations.

**Solutions**:
1. Check what mode was actually used in manifest
2. Explicitly specify desired mode:
   ```javascript
   await start_scan_job({ color_mode: "Color", resolution_dpi: 600 });
   ```

---

### "Pages missing from output"

**Symptoms**: Fewer pages captured than expected.

**Solutions**:
1. Check `manifest.json` for page count
2. Verify feeder didn't jam mid-scan (check events)
3. For flatbed: User may need to scan again with source change
4. Retry scan

---

## Retry Strategies

### Transient Failures

If failure looks transient (paper jam, timeout, device busy):

**Retry with same parameters**:
```javascript
await start_scan_job(originalParams);
```

### Performance Issues

**Lower resolution if timeout/performance issues**:
```javascript
await start_scan_job({
  ...originalParams,
  resolution_dpi: 150
});
```

### Feeder Problems

**Switch sources if feeder fails**:
```javascript
await start_scan_job({
  ...originalParams,
  source: "Flatbed"
});
```

### Device Selection Issues

**Try different device**:
```javascript
const devices = await list_devices();
await start_scan_job({
  ...originalParams,
  device_id: devices[1].deviceId  // Try second device
});
```

---

## Diagnostic Commands

When troubleshooting, these commands help understand state:

**Check job state**:
```javascript
await get_job_status({ job_id });
```

**Inspect job configuration**:
```javascript
await get_manifest({ job_id });
```

**Review error timeline**:
```javascript
await get_events({ job_id });
```

**Check available devices**:
```javascript
await list_devices();
```

**Verify device capabilities**:
```javascript
await get_device_options({ device_id });
```

**List recent jobs**:
```javascript
await list_jobs({ limit: 10 });
```

**Filter by state**:
```javascript
await list_jobs({ state: "error" });
```
