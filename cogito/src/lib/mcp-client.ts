/**
 * MCP client connecting to the remote cogito-mcp server.
 * Wraps @modelcontextprotocol/sdk to list and call tools.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** MCP tool definition in the format vLLM expects for function calling. */
export interface VllmToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class McpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private connected = false;
  private cachedTools: McpTool[] = [];

  constructor(private serverUrl: string) {
    this.client = new Client({
      name: 'cogito-orchestrator',
      version: '1.0.0',
    });
  }

  async connect(): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl));
    await this.client.connect(this.transport);
    this.connected = true;

    // Pre-cache tools on connect
    const result = await this.client.listTools();
    this.cachedTools = (result.tools || []) as McpTool[];
    console.log(`[MCP] Connected to ${this.serverUrl}, ${this.cachedTools.length} tool(s) available`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.connected) return [];
    const result = await this.client.listTools();
    this.cachedTools = (result.tools || []) as McpTool[];
    return this.cachedTools;
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    if (!this.connected) throw new Error('MCP client not connected');
    const result = await this.client.callTool({
      name,
      arguments: args as Record<string, unknown>,
    });

    // Extract text content from MCP response
    const contents = result.content as Array<{ type: string; text?: string }>;
    const text = contents?.find(c => c.type === 'text')?.text;
    if (text) {
      try { return JSON.parse(text); } catch {}
      return text;
    }
    return result.content;
  }

  /** Convert MCP tools to vLLM function-calling format. */
  async getToolsForVllm(): Promise<VllmToolDef[]> {
    const tools = this.cachedTools.length > 0 ? this.cachedTools : await this.listTools();
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }
}
