import type { AppConfig } from "../../config.js";
import type { Backend } from "./backend.js";
import { SaneBackend } from "./sane.js";
import { MockBackend } from "./mock.js";
import { IcaBackend } from "./ica.js";

export function backendName(config: AppConfig, platform = process.platform): Backend["name"] {
  if (config.SCAN_MOCK) return "mock";
  if (config.SCAN_BACKEND === "ica" && platform !== "darwin") {
    throw new Error("SCAN_BACKEND=ica requires macOS 15 or newer");
  }
  return config.SCAN_BACKEND ?? (platform === "darwin" ? "ica" : "sane");
}

export function selectBackend(config: AppConfig): Backend {
  switch (backendName(config)) {
    case "ica": return new IcaBackend();
    case "mock": return new MockBackend();
    case "sane": return new SaneBackend();
  }
}
