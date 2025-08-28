import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { createLogger, maskAuthHeaders } from "../server/logger.js";
import type { IncomingHttpHeaders } from "node:http";

describe("logger utilities", () => {
  it("masks authorization and api key headers", () => {
    const headers: IncomingHttpHeaders = {
      authorization: "Bearer abcdefghijkl", // 12 chars -> last 4 kept
      "x-api-key": "short",
    };
    const masked = maskAuthHeaders(headers);
    expect(masked.authorization).toBe("Bearer ***ijkl");
    expect(masked["x-api-key"]).toBe("***");
  });

  it("uses stderr destination in stdio mode", () => {
    const spy = vi.spyOn(pino, "destination");
    createLogger("stdio", "info");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ fd: 2 }));
    spy.mockRestore();
  });

  it("uses default stdout in http mode", () => {
    const spy = vi.spyOn(pino, "destination");
    createLogger("http", "info");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

