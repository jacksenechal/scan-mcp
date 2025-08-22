import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import pino from "pino";
import { loadConfig } from "./config.js";
import { registerScanServer } from "./server/register.js";

type SseSession = { server: McpServer; transport: SSEServerTransport };

export function startHttpServer(opts: { enableStreamable?: boolean; enableSse?: boolean } = {}) {
  const config = loadConfig();
  const logger = pino({ level: config.LOG_LEVEL }, pino.destination({ fd: 2 }));
  const app = express();
  app.use(express.json({ limit: "4mb" }));

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
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = String(req.query.sessionId ?? "");
      const session = sseSessions[sessionId];
      if (!session) return res.status(400).send("No transport found for sessionId");
      await session.transport.handlePostMessage(
        req as unknown as IncomingMessage & { auth?: AuthInfo },
        res as unknown as ServerResponse,
        (req as unknown as { body?: unknown }).body
      );
    });
  }

  const port = Number(process.env.MCP_HTTP_PORT || 3001);
  app.listen(port, () => {
    logger.info({ port, enableStreamable, enableSse }, "scan-mcp HTTP server ready");
  });
}

// Allow running directly
if (process.argv[1] && process.argv[1].endsWith("http-server.js")) {
  startHttpServer();
}
