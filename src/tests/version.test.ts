import { describe, it, expect } from "vitest";
import { version } from "../mcp.js";
import pkg from "../../package.json" with { type: "json" };

describe("version", () => {
  it("matches package.json", () => {
    expect(version).toBe(pkg.version);
  });
});

