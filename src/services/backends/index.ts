import type { AppConfig } from "../../config.js";
import type { Backend } from "./backend.js";
import { SaneBackend } from "./sane.js";
import { MockBackend } from "./mock.js";

export function selectBackend(config: AppConfig): Backend {
  return config.SCAN_MOCK ? new MockBackend() : new SaneBackend();
}
