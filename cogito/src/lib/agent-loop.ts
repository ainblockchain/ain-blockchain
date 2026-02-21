/**
 * Agent loop: vLLM reasons, MCP provides tools.
 *
 * 1. Get MCP tools, convert to vLLM function format
 * 2. Send messages + tool definitions to vLLM
 * 3. While vLLM wants tool calls, execute them via MCP
 * 4. Return final synthesized response
 */

import { McpClient } from './mcp-client';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

const MAX_TOOL_ROUNDS = 10;

export async function runAgentLoop(
  mcpClient: McpClient,
  vllmUrl: string,
  vllmModel: string,
  messages: ChatMessage[],
): Promise<string> {
  // 1. Get MCP tools, convert to vLLM function format
  const tools = await mcpClient.getToolsForVllm();

  // 2. Call vLLM with tools
  let response = await callVllm(vllmUrl, vllmModel, messages, tools);

  // 3. While vLLM wants tool calls, execute them
  let rounds = 0;
  while (response.tool_calls && response.tool_calls.length > 0 && rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: response.tool_calls,
    });

    // Execute each tool call via MCP
    for (const call of response.tool_calls) {
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        args = {};
      }

      let result: unknown;
      try {
        result = await mcpClient.callTool(call.function.name, args);
      } catch (err: any) {
        result = { error: err.message };
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    // Call vLLM again with tool results
    response = await callVllm(vllmUrl, vllmModel, messages, tools);
  }

  return response.content || '';
}

async function callVllm(
  vllmUrl: string,
  model: string,
  messages: ChatMessage[],
  tools: unknown[],
): Promise<{ content: string; tool_calls?: ToolCall[] }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 4096,
    temperature: 0.7,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${vllmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`vLLM error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as any;
  const choice = data.choices?.[0]?.message;

  return {
    content: choice?.content || '',
    tool_calls: choice?.tool_calls,
  };
}
