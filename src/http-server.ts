import express, { type Request, type Response } from "express";
import { fileURLToPath } from "url";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createLogger, maskAuthHeaders } from "./server/logger.js";
import { loadConfig } from "./config.js";
import { registerScanServer } from "./server/register.js";

type SseSession = { server: McpServer; transport: SSEServerTransport };

export function startHttpServer(opts: { enableStreamable?: boolean; enableSse?: boolean } = {}): HttpServer {
  const config = loadConfig();
  const logger = createLogger("http", config.LOG_LEVEL);
  const app = express();
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

  const sseSessions: Record<string, SseSession> = {};
  const enableStreamable = opts.enableStreamable !== false; // default true
  const enableSse = opts.enableSse !== false; // default true

  // Streamable HTTP (stateless)
  if (enableStreamable) {
    app.post("/mcp", async (req: Request, res: Response) => {
      try {
        const server = new McpServer({ name: "scan-mcp", version: "0.1.0" }, { capabilities: { tools: {}, resources: {} } });
        registerScanServer(server, config);
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

  // SSE (stateful)
  if (enableSse) {
    app.get("/sse", async (_req: Request, res: Response) => {
      const server = new McpServer({ name: "scan-mcp", version: "0.1.0" }, { capabilities: { tools: {}, resources: {} } });
      registerScanServer(server, config);
      const transport = new SSEServerTransport("/messages", res as unknown as ServerResponse);
      sseSessions[transport.sessionId] = { server, transport };
      res.on("close", () => { delete sseSessions[transport.sessionId]; });
      await server.connect(transport);
      logger.info({ sessionId: transport.sessionId }, "SSE session started");
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = String(req.query.sessionId ?? "");
      const session = sseSessions[sessionId];
      if (!session) {
        logger.warn({ sessionId }, "SSE POST with unknown sessionId");
        return res.status(400).send("No transport found for sessionId");
      }
      const payload = (req as unknown as { body?: unknown }).body;
      const rpc = summarizeRpc(payload);
      logger.debug({ sessionId, rpc }, "sse message");
      await session.transport.handlePostMessage(
        req as unknown as IncomingMessage & { auth?: AuthInfo },
        res as unknown as ServerResponse,
        (req as unknown as { body?: unknown }).body
      );
    });
  }

  const port = Number(process.env.MCP_HTTP_PORT || 3001);
  const server = app.listen(port, "::", () => {
    logger.info({ port, enableStreamable, enableSse }, "scan-mcp HTTP server ready");
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
