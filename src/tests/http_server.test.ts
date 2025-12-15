import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { startHttpServer } from "../http-server.js";

describe("http server", () => {
  let server: ReturnType<typeof startHttpServer>;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.MCP_HTTP_PORT = "0";
    process.env.LOG_LEVEL = "silent";
    server = startHttpServer();
    await new Promise<void>((resolve) => server.on("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("responds to tools.list via /mcp", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    const body = JSON.parse(dataLine?.slice(6) || "{}") as {
      result: { tools: { name: string }[] };
    };
    expect(body.result.tools.some((t) => t.name === "list_devices")).toBe(true);
  });

  it("rejects GET on /mcp", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      headers: { accept: "application/json" },
    });
    expect(response.status).toBe(405);
    const text = await response.text();
    expect(text).toMatch(/Method not allowed/);
  });

});
