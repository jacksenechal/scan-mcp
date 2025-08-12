import { describe, it, expect } from "vitest";
import { parseScanimageList, parseScanimageOptions } from "../src/services/sane";

describe("sane parsers", () => {
  it("parses scanimage -L output", () => {
    const text = [
      "device `epjitsu:libusb:001:004' is a FUJITSU ScanSnap S1500 scanner",
      "device `genesys:libusb:002:003' is a Canon LiDE 110 flatbed scanner",
    ].join("\n");
    const devices = parseScanimageList(text);
    expect(devices.length).toBe(2);
    expect(devices[0].id).toContain("epjitsu");
    expect(devices[0].vendor).toBeDefined();
  });

  it("parses scanimage -A options", () => {
    const text = [
      "  --mode Color|Gray|Lineart",
      "  --source Flatbed|ADF|ADF Duplex",
      "  --resolution 75dpi|150dpi|300dpi",
    ].join("\n");
    const opts = parseScanimageOptions(text);
    expect(opts.color_modes).toEqual(["Color", "Gray", "Lineart"]);
    expect(opts.sources).toEqual(["Flatbed", "ADF", "ADF Duplex"]);
    expect(opts.duplex).toBe(true);
    expect(opts.adf).toBe(true);
    expect(opts.resolutions).toEqual([75, 150, 300]);
  });
});

