import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { getAin } from '@/lib/globals';
import { getX402Server, X402_NETWORK } from '@/lib/x402';
import { config } from '@/lib/config';

async function handler(
  _request: NextRequest,
  { params }: { params: Promise<{ topicKey: string; entryId: string }> },
) {
  const { topicKey, entryId } = await params;
  const ain = await getAin();
  const topicPath = topicKey.replace(/_/g, '/');
  const explorations = await ain.getExplorations(topicPath);

  if (!explorations || !explorations[entryId]) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  const entry = explorations[entryId];
  return NextResponse.json({
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    tags: (entry.tags || '').split(','),
    depth: entry.depth,
    created_at: entry.created_at,
  });
}

// x402 gating — payment settles only after successful response
export const GET = withX402(
  handler as any,
  {
    accepts: {
      scheme: 'exact',
      price: `$${config.contentPrice}`,
      network: X402_NETWORK,
      payTo: process.env.BASE_PAY_TO || '0xA7b9a0959451aeF731141a9e6FFcC619DeB563bF',
    },
    description: 'Access to gated knowledge content',
  },
  getX402Server(),
);
