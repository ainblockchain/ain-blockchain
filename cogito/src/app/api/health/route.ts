import { NextResponse } from 'next/server';
import { getAin, getMcpClient } from '@/lib/globals';

export async function GET() {
  const ain = await getAin();
  const mcp = await getMcpClient();
  const tools = mcp.isConnected() ? await mcp.listTools() : [];
  return NextResponse.json({
    status: 'ok',
    address: ain.getAddress(),
    mcpTools: tools.map(t => t.name),
  });
}
