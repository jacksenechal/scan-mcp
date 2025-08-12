import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectDevice } from "../src/services/select";
import * as sane from "../src/services/sane";
import { loadConfig } from "../src/config";

describe("selectDevice", () => {
  const config = loadConfig();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers ADF-capable scanner over v4l camera", async () => {
    vi.spyOn(sane, "listDevices").mockResolvedValue([
      { id: "v4l:/dev/video0", vendor: "Logitech", model: "C920" } as any,
      { id: "genesys:001:002", vendor: "Acme", model: "DocScanner 2000" } as any,
    ]);
    vi.spyOn(sane, "getDeviceOptions").mockImplementation(async (id: string) => {
      if (id.startsWith("v4l:")) return { sources: ["Flatbed"], resolutions: [75, 150] } as any;
      return { sources: ["Flatbed", "ADF", "ADF Duplex"], resolutions: [200, 300, 600] } as any;
    });

    const sel = await selectDevice({ desiredSource: "ADF Duplex", desiredResolutionDpi: 300 }, config);
    expect(sel).not.toBeNull();
    expect(sel!.deviceId).toBe("genesys:001:002");
  });

  it("falls back gracefully when only flatbed is available", async () => {
    vi.spyOn(sane, "listDevices").mockResolvedValue([
      { id: "xyz:000:001", vendor: "FlatbedCo", model: "SimpleScan" } as any,
    ]);
    vi.spyOn(sane, "getDeviceOptions").mockResolvedValue({ sources: ["Flatbed"], resolutions: [300] } as any);

    const sel = await selectDevice({ desiredSource: "ADF" }, config);
    expect(sel).not.toBeNull();
    expect(sel!.deviceId).toBe("xyz:000:001");
  });
});

