import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../config.js";
import { selectBackend } from "../services/backends/index.js";

describe("backend selection", () => {
  it("selects SANE by default", () => {
    expect(selectBackend(ConfigSchema.parse({})).name).toBe("sane");
  });
  it("selects the mock backend when SCAN_MOCK is set", () => {
    expect(selectBackend(ConfigSchema.parse({ SCAN_MOCK: true })).name).toBe("mock");
  });
});
