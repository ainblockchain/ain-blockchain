import { NextRequest, NextResponse } from 'next/server';
import { getAin } from '@/lib/globals';
import { getA2ATransport } from '@/lib/a2a';

export async function POST(request: NextRequest) {
  try {
    const ain = await getAin();
    const transport = getA2ATransport(ain);
    const body = await request.json();
    const result = await transport.handle(body);

    // handle streaming vs single response
    if (Symbol.asyncIterator in (result as any)) {
      const chunks: any[] = [];
      for await (const chunk of result as AsyncIterable<any>) {
        chunks.push(chunk);
      }
      // Return last chunk as the response (streaming not supported over simple HTTP)
      return NextResponse.json(chunks[chunks.length - 1] || {});
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } },
      { status: 500 },
    );
  }
}
