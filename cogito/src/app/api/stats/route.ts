import { NextResponse } from 'next/server';
import { getAin, getMcpClient } from '@/lib/globals';

export async function GET() {
  try {
    const ain = await getAin();
    const mcp = await getMcpClient();
    const frontier = await ain.getFrontierMap();
    const graph = await ain.getGraph();
    const tools = mcp.isConnected() ? await mcp.listTools() : [];

    return NextResponse.json({
      address: ain.getAddress(),
      mcpTools: tools.length,
      topics: frontier.length,
      graphNodes: Object.keys(graph.nodes || {}).length,
      graphEdges: Object.keys(graph.edges || {}).length,
      frontier,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
