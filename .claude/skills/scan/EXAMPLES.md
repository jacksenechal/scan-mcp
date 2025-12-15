# User Intent → Parameter Examples

Detailed mappings from user requests to scan-mcp parameters.

## General Rule

If the user is vague, use `{}`. If the user's intent implies specific requirements, override only those parameters.

---

## Generic Scan Requests

**User says**: "Scan this", "Start a scan", "Scan the document"

**Action**: `start_scan_job({})`

**Reasoning**: Trust server defaults—300 dpi, Lineart, ADF Duplex with auto-selected device.

---

## Photo Scanning

**User says**: "Scan this photo", "High-quality photo scan", "Scan a picture"

**Parameters**:
```json
{
  "source": "Flatbed",
  "color_mode": "Color",
  "resolution_dpi": 600
}
```

**Reasoning**: Photos need flatbed (single-page), full color, and high resolution.

**Variation**: "Highest quality scan"
```json
{
  "source": "Flatbed",
  "color_mode": "Color",
  "resolution_dpi": 1200
}
```

---

## Duplex Stack Scanning

**User says**: "Scan a stack double-sided", "Use the feeder, both sides", "Scan these duplex"

**Parameters**:
```json
{
  "duplex": true
}
```

**Reasoning**: `duplex: true` nudges server toward ADF Duplex. Let server handle other defaults.

**Variation**: "Scan these pages front and back in color"
```json
{
  "duplex": true,
  "color_mode": "Color"
}
```

---

## OCR-Optimized Scanning

**User says**: "Scan text for OCR", "Scan document for text extraction"

**Parameters**:
```json
{
  "resolution_dpi": 300,
  "color_mode": "Gray"
}
```

**Reasoning**: 300 dpi is optimal for OCR. Gray mode provides better quality than Lineart while remaining compact.

---

## Specific Scanner Selection

**User says**: "Use the Epson scanner", "Scan with the HP", "What scanners do I have?"

**Strategy**:
1. Call `list_devices()` to enumerate available scanners
2. Identify the device matching user's request
3. Call `start_scan_job({ device_id: "..." })` with the matched device

**Example**:
```javascript
// 1. List devices
const devices = await list_devices();

// 2. Find Epson scanner
const epson = devices.find(d =>
  d.backend === 'epson2' || d.model.toLowerCase().includes('epson')
);

// 3. Start scan with specific device
await start_scan_job({ device_id: epson.deviceId });
```

---

## Receipts and Small Documents

**User says**: "Scan this receipt", "Scan a business card", "Scan a note"

**Parameters**: `{}` or optionally:
```json
{
  "source": "Flatbed"
}
```

**Reasoning**: Small documents work fine with defaults. Flatbed preferred for delicate items.

---

## Large Format Documents

**User says**: "Scan legal-size document", "Scan A4 paper"

**Parameters**:
```json
{
  "page_size": "Legal"
}
```

or

```json
{
  "page_size": "A4"
}
```

**Reasoning**: Explicit page size ensures scanner uses correct scan area.

---

## Draft/Quick Scans

**User says**: "Quick scan", "Draft quality", "Fast scan"

**Parameters**:
```json
{
  "resolution_dpi": 150
}
```

**Reasoning**: Lower resolution scans faster, smaller files. Good for previews.

---

## Archival/High-Quality Documents

**User says**: "Archival scan", "Highest quality", "Preserve all detail"

**Parameters**:
```json
{
  "resolution_dpi": 1200,
  "color_mode": "Color"
}
```

**Reasoning**: Maximum resolution and full color for preservation purposes.

---

## Mixed Document Stacks

**User says**: "Scan these mixed documents", "Batch scan these pages"

**Parameters**: `{}` or:
```json
{
  "duplex": false
}
```

**Reasoning**: Defaults work well. Specify `duplex: false` to use single-sided ADF if documents vary in thickness.

---

## Flatbed-Only Requests

**User says**: "Use the flatbed", "Scan from the glass"

**Parameters**:
```json
{
  "source": "Flatbed"
}
```

**Reasoning**: User explicitly requested flatbed source.

---

## Color Preservation

**User says**: "Scan in color", "Preserve colors", "Color scan"

**Parameters**:
```json
{
  "color_mode": "Color"
}
```

**Reasoning**: User explicitly wants color output.

---

## Black and White Documents

**User says**: "Black and white scan", "Text only", "No color needed"

**Parameters**: `{}` (defaults to Lineart) or explicitly:
```json
{
  "color_mode": "Lineart"
}
```

**Reasoning**: Lineart provides smallest files for pure text documents.
