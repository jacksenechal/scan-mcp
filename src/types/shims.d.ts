declare module "@modelcontextprotocol/sdk" {
  export class Server {
    constructor(info: { name: string; version: string }, opts: { capabilities: { tools: object; resources: object } });
    tool(
      name: string,
      def: {
        description?: string;
        inputSchema?: object;
        outputSchema?: object;
        handler: (input: unknown) => Promise<unknown>;
      }
    ): void;
    connect(transport: unknown): Promise<void>;
  }
}

declare module "@modelcontextprotocol/sdk/node" {
  export class StdioServerTransport {
    constructor(...args: unknown[]);
  }
}
