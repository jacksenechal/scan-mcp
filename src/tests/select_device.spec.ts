import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectDevice } from "../services/select.js";
import * as sane from "../services/sane.js";
import type { AppConfig } from "../config.js";

const config: AppConfig = {
  SCAN_MOCK: true,
  INBOX_DIR: "/tmp",
  LOG_LEVEL: "silent",
  SCAN_EXCLUDE_BACKENDS: [],
  SCAN_PREFER_BACKENDS: [],
  SCANIMAGE_BIN: "scanimage",
  TIFFCP_BIN: "tiffcp",
  IM_CONVERT_BIN: "convert",
};

describe("device selection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers ADF-capable scanner over v4l camera", async () => {
    vi.spyOn(sane, "listDevices").mockResolvedValue([
      { id: "v4l:/dev/video0", vendor: "Logitech", model: "C920" },
      { id: "genesys:001:002", vendor: "Acme", model: "DocScanner 2000" },
    ]);
    vi.spyOn(sane, "getDeviceOptions").mockImplementation(async (id: string) => {
      if (id.startsWith("v4l:")) return { sources: ["Flatbed"], resolutions: [75, 150] };
      return { sources: ["Flatbed", "ADF", "ADF Duplex"], resolutions: [200, 300, 600] };
    });

    const sel = await selectDevice({ desiredSource: "ADF Duplex", desiredResolutionDpi: 300 }, config);
    expect(sel).not.toBeNull();
    expect(sel!.deviceId).toBe("genesys:001:002");
  });

  it("falls back gracefully when only flatbed is available", async () => {
    vi.spyOn(sane, "listDevices").mockResolvedValue([
      { id: "xyz:000:001", vendor: "FlatbedCo", model: "SimpleScan" },
    ]);
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ sources: ["Flatbed"], resolutions: [300] });

    const sel = await selectDevice({ desiredSource: "ADF" }, config);
    expect(sel).not.toBeNull();
    expect(sel!.deviceId).toBe("xyz:000:001");
  });
});

