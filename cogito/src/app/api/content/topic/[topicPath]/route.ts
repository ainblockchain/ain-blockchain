import { NextRequest, NextResponse } from 'next/server';
import { getAin } from '@/lib/globals';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ topicPath: string }> },
) {
  try {
    const { topicPath: rawPath } = await params;
    const ain = await getAin();
    const topicPath = rawPath.replace(/_/g, '/');
    const explorations = await ain.getExplorations(topicPath);

    if (!explorations) {
      return NextResponse.json({ count: 0, entries: [] });
    }

    const entries = Object.entries(explorations).map(([id, entry]: [string, any]) => ({
      id,
      title: entry.title,
      summary: entry.summary,
      tags: (entry.tags || '').split(','),
      price: entry.price || '0',
      created_at: entry.created_at,
    }));

    return NextResponse.json({ count: entries.length, entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
