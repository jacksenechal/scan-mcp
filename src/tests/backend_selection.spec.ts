import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../config.js";
import { backendName } from "../services/backends/index.js";
import { resolveHelperPath } from "../services/helper-path.js";

describe("backend selection", () => {
  it("selects ICA on macOS and SANE on Linux", () => {
    const config = ConfigSchema.parse({});
    expect(backendName(config, "darwin")).toBe("ica");
    expect(backendName(config, "linux")).toBe("sane");
    expect(backendName({ ...config, SCAN_BACKEND: "sane" }, "darwin")).toBe("sane");
  });
  it("gives mock mode precedence and rejects ICA on other platforms", () => {
    const config = ConfigSchema.parse({ SCAN_BACKEND: "ica" });
    expect(() => backendName(config, "linux")).toThrow(/macOS/);
    expect(backendName({ ...config, SCAN_MOCK: true }, "linux")).toBe("mock");
  });
  it("honors missing helper overrides rather than falling back to a dev binary", () => {
    expect(resolveHelperPath(ConfigSchema.parse({ MCP_SCANNER_HELPER_BIN: "/missing/helper" }))).toBe("/missing/helper");
    expect(resolveHelperPath(ConfigSchema.parse({}))).toMatch(/\/dist\/bin\/mcp-scanner-helper$/);
  });
});
