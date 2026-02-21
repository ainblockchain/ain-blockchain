import { NextResponse } from 'next/server';
import { getAin } from '@/lib/globals';
import type { ContentListing } from '@/lib/types';

export async function GET() {
  try {
    const ain = await getAin();
    const explorations = await ain.getAllExplorations();
    const listings: ContentListing[] = [];

    if (explorations) {
      for (const [topicKey, entries] of Object.entries(explorations)) {
        if (!entries || typeof entries !== 'object') continue;
        for (const [entryId, entry] of Object.entries(entries as Record<string, any>)) {
          const tags = (entry.tags || '').split(',').map((t: string) => t.trim());
          listings.push({
            id: `${topicKey}/${entryId}`,
            title: entry.title || 'Untitled',
            summary: entry.summary || '',
            tags,
            price: entry.price || '0',
            created_at: entry.created_at || 0,
          });
        }
      }
    }

    listings.sort((a, b) => b.created_at - a.created_at);
    return NextResponse.json({ count: listings.length, listings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
