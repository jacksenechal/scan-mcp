import { promises as fs } from "fs";
import path from "path";
import type { Backend, Device, DeviceOptions, RunScanArgs, RunScanResult } from "./backend.js";

export class MockBackend implements Backend {
  readonly name = "mock" as const;

  async listDevices(): Promise<Device[]> {
    return [
      {
        id: "epjitsu:libusb:001:004",
        vendor: "FUJITSU",
        model: "ScanSnap",
        capabilities: {
          adf: true,
          duplex: true,
          color_modes: ["Color", "Gray", "Lineart"],
          resolutions: [200, 300, 600],
        },
      },
    ];
  }

  async getDeviceOptions(): Promise<DeviceOptions> {
    return {
      sources: ["Flatbed", "ADF", "ADF Duplex"],
      color_modes: ["Color", "Gray", "Lineart"],
      resolutions: [200, 300, 600],
      adf: true,
      duplex: true,
    };
  }

  async runScan(args: RunScanArgs): Promise<RunScanResult> {
    const { runDir, onEvent } = args;
    // Create a couple of fake TIFFs to simulate capture
    const pageCount = 2;
    for (let i = 1; i <= pageCount; i++) {
      const p = path.join(runDir, `page_${String(i).padStart(4, "0")}.tiff`);
      await fs.writeFile(p, `MOCK_TIFF_PAGE_${i}`);
      await onEvent({ type: "page_scanned", index: i, path: p });
    }
    return { ran: true };
  }

  async assembleTiff(pages: string[], output: string): Promise<void> {
    // In mock mode, directly copy the first page to simulate assembly
    await fs.copyFile(pages[0], output);
  }

  async probeResolution(): Promise<boolean> {
    return true;
  }
}
