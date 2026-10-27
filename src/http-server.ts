import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { fileURLToPath } from "url";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createLogger, maskAuthHeaders } from "./server/logger.js";
import { loadConfig, loadHttpConfig } from "./config.js";
import { registerScanServer } from "./server/register.js";
import { selectBackend } from "./services/backends/index.js";
import type { AppContext } from "./context.js";
import pkg from "../package.json" with { type: "json" };

const version = pkg.version as string;

const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

/** True for localhost, 127.0.0.0/8 and ::1 (the only binds allowed without a token). */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Normalize a host entry to the form `URL.hostname` yields (port stripped, IPv6 bracketed). */
function normalizeHostname(entry: string): string {
  try {
    return new URL(`http://${entry}`).hostname.toLowerCase();
  } catch {
    return entry.toLowerCase();
  }
}

function deny(res: Response, status: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

/** Reject requests whose Origin host is not allowed (absent Origin, i.e. non-browser clients, passes). */
function originValidation(allowedHostnames: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin === undefined) return next();
    let hostname: string;
    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      return deny(res, 403, "Invalid Origin");
    }
    if (!allowedHostnames.includes(hostname)) return deny(res, 403, `Invalid Origin: ${hostname}`);
    next();
  };
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** Require `Authorization: Bearer <token>`; compares fixed-length digests in constant time. */
function bearerAuth(token: string): RequestHandler {
  const expected = sha256(token);
  return (req: Request, res: Response, next: NextFunction) => {
    const m = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "");
    if (!m || !timingSafeEqual(sha256(m[1]), expected)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return deny(res, 401, "Unauthorized");
    }
    next();
  };
}

export function startHttpServer(opts: { enableStreamable?: boolean } = {}): HttpServer {
  const config = loadConfig();
  const logger = createLogger("http", config.LOG_LEVEL);
  const ctx: AppContext = { config, logger, backend: selectBackend(config) };
  const http = loadHttpConfig();
  const host = http.MCP_HTTP_HOST;
  const port = http.MCP_HTTP_PORT;
  const loopback = isLoopbackHost(host);
  if (!loopback && !http.MCP_HTTP_TOKEN) {
    throw new Error(
      `Refusing to start: MCP_HTTP_HOST=${host} is not a loopback address, so MCP_HTTP_TOKEN must be set ` +
        "(clients then send 'Authorization: Bearer <token>')."
    );
  }
  // Loopback names are trusted only when actually bound to loopback; proxies/tunnels add theirs explicitly.
  const allowedHostnames = [
    ...(loopback ? LOOPBACK_HOSTNAMES : [normalizeHostname(host)]),
    ...http.MCP_HTTP_ALLOWED_HOSTS.map(normalizeHostname),
  ];

  const app = express();
  app.disable("x-powered-by");
  // DNS rebinding protection (a hostile page re-pointing its DNS name at this server): always on.
  app.use(hostHeaderValidation(allowedHostnames));
  app.use(originValidation(allowedHostnames));
  if (http.MCP_HTTP_TOKEN) app.use("/mcp", bearerAuth(http.MCP_HTTP_TOKEN));
  app.use(express.json({ limit: "4mb" }));

  // Debug incoming requests (headers masked)
  app.use((req, _res, next) => {
    const headers = maskAuthHeaders(req.headers);
    const payload = (req as unknown as { body?: unknown }).body;
    const rpc = summarizeRpc(payload);
    logger.debug({ method: req.method, url: req.url, headers, rpc }, "http request");
    next();
  });

  function summarizeRpc(payload: unknown): { method?: string; id?: unknown; tool?: string } | undefined {
    try {
      const msg = Array.isArray(payload) ? payload[0] : payload;
      if (msg && typeof msg === "object") {
        const m = msg as { method?: unknown; id?: unknown; params?: unknown };
        const out: { method?: string; id?: unknown; tool?: string } = {};
        if (typeof m.method === "string") out.method = m.method;
        if (m.id !== undefined) out.id = m.id;
        if (m.params && typeof m.params === "object") {
          const p = m.params as { name?: unknown };
          if (typeof p.name === "string") out.tool = p.name;
        }
        return out;
      }
    } catch {}
    return undefined;
  }

  const enableStreamable = opts.enableStreamable !== false; // default true

  // Streamable HTTP (stateless)
  if (enableStreamable) {
    app.post("/mcp", async (req: Request, res: Response) => {
      try {
        const server = new McpServer({ name: "scan-mcp", version }, { capabilities: { tools: {}, resources: {} } });
        registerScanServer(server, ctx);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => { transport.close().catch(() => {}); });
        await server.connect(transport);
        await transport.handleRequest(
          req as unknown as IncomingMessage & { auth?: AuthInfo },
          res as unknown as ServerResponse,
          (req as unknown as { body?: unknown }).body
        );
      } catch (error) {
        logger.error({ err: error }, "Streamable HTTP error");
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
        }
      }
    });

    app.get("/mcp", (_req: Request, res: Response) => {
      res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
    });
    app.delete("/mcp", (_req: Request, res: Response) => {
      res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
    });
  }

  const server = app.listen(port, host, () => {
    logger.info({ port, host, enableStreamable, auth: Boolean(http.MCP_HTTP_TOKEN) }, "scan-mcp HTTP server ready");
  });
  return server;
}

// Allow running directly (works for tsx and compiled js)
const isMain = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return path.resolve(process.argv[1] || "") === thisFile;
  } catch {
    return false;
  }
})();
if (isMain) startHttpServer();
