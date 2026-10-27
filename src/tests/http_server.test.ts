import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
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

  it("binds to localhost by default", () => {
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
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

type Resp = { status: number; headers: http.IncomingHttpHeaders; body: string };

/** Raw request so tests can set Host/Origin (fetch forbids overriding them). */
function rawPost(port: number, headers: Record<string, string>): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
  });
}

const HTTP_ENV = ["MCP_HTTP_HOST", "MCP_HTTP_PORT", "MCP_HTTP_TOKEN", "MCP_HTTP_ALLOWED_HOSTS"] as const;

async function withServer(env: Partial<Record<(typeof HTTP_ENV)[number], string>>, fn: (port: number) => Promise<void>) {
  for (const k of HTTP_ENV) delete process.env[k];
  process.env.MCP_HTTP_PORT = "0";
  process.env.LOG_LEVEL = "silent";
  Object.assign(process.env, env);
  try {
    const server = startHttpServer();
    await new Promise<void>((resolve) => server.on("listening", () => resolve()));
    try {
      await fn((server.address() as AddressInfo).port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    for (const k of HTTP_ENV) delete process.env[k];
  }
}

describe("http server host/origin validation (DNS rebinding)", () => {
  it("rejects an unexpected Host", async () => {
    await withServer({}, async (port) => {
      const r = await rawPost(port, { host: "evil.example.com" });
      expect(r.status).toBe(403);
    });
  });

  it("accepts localhost Hosts with and without a port", async () => {
    await withServer({}, async (port) => {
      for (const host of ["localhost", `localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) {
        expect((await rawPost(port, { host })).status).toBe(200);
      }
    });
  });

  it("rejects a foreign Origin even with a good Host", async () => {
    await withServer({}, async (port) => {
      const r = await rawPost(port, { host: `127.0.0.1:${port}`, origin: "http://evil.example.com" });
      expect(r.status).toBe(403);
    });
  });

  it("accepts a local Origin", async () => {
    await withServer({}, async (port) => {
      const r = await rawPost(port, { host: `127.0.0.1:${port}`, origin: `http://localhost:${port}` });
      expect(r.status).toBe(200);
    });
  });

  it("accepts Hosts and Origins listed in MCP_HTTP_ALLOWED_HOSTS", async () => {
    await withServer({ MCP_HTTP_ALLOWED_HOSTS: "scan.example.com, other.example.com" }, async (port) => {
      expect((await rawPost(port, { host: "scan.example.com" })).status).toBe(200);
      expect((await rawPost(port, { host: "scan.example.com", origin: "https://scan.example.com" })).status).toBe(200);
      expect((await rawPost(port, { host: "evil.example.com" })).status).toBe(403);
    });
  });

  it("does not advertise x-powered-by", async () => {
    await withServer({}, async (port) => {
      const r = await rawPost(port, { host: "127.0.0.1" });
      expect(r.headers["x-powered-by"]).toBeUndefined();
    });
  });
});

describe("http server bearer token", () => {
  it("rejects a missing or wrong token with 401 and WWW-Authenticate", async () => {
    await withServer({ MCP_HTTP_TOKEN: "s3cret" }, async (port) => {
      const missing = await rawPost(port, {});
      expect(missing.status).toBe(401);
      expect(missing.headers["www-authenticate"]).toBe("Bearer");
      expect((await rawPost(port, { authorization: "Bearer wrong" })).status).toBe(401);
      expect((await rawPost(port, { authorization: "Basic s3cret" })).status).toBe(401);
    });
  });

  it("accepts the correct token", async () => {
    await withServer({ MCP_HTTP_TOKEN: "s3cret" }, async (port) => {
      expect((await rawPost(port, { authorization: "Bearer s3cret" })).status).toBe(200);
    });
  });

  it("refuses to start on a non-loopback bind without a token", async () => {
    await expect(withServer({ MCP_HTTP_HOST: "0.0.0.0" }, async () => {})).rejects.toThrow(/MCP_HTTP_TOKEN/);
  });

  it.each([["0.0.0.0"], ["::"]])("with a token on wildcard bind %s, loopback Hosts pass and others are rejected", async (bind) => {
    await withServer({ MCP_HTTP_HOST: bind, MCP_HTTP_TOKEN: "s3cret" }, async (port) => {
      const auth = { authorization: "Bearer s3cret" };
      expect((await rawPost(port, { host: `localhost:${port}`, ...auth })).status).toBe(200);
      expect((await rawPost(port, { host: "evil.example.com", ...auth })).status).toBe(403);
      expect((await rawPost(port, { host: bind, ...auth })).status).toBe(403);
    });
  });
});

describe("http config validation", () => {
  it.each([["abc"], ["70000"], ["-1"], ["3.5"]])("rejects invalid MCP_HTTP_PORT %s", async (bad) => {
    await expect(withServer({ MCP_HTTP_PORT: bad }, async () => {})).rejects.toThrow(/MCP_HTTP_PORT/);
  });

  it.each([["http://evil/"], ["a b"]])("rejects invalid MCP_HTTP_HOST %s", async (bad) => {
    await expect(withServer({ MCP_HTTP_HOST: bad }, async () => {})).rejects.toThrow(/MCP_HTTP_HOST/);
  });
});
