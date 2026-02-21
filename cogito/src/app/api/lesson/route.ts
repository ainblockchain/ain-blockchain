import { NextRequest, NextResponse } from 'next/server';
import { getAin } from '@/lib/globals';

export async function POST(request: NextRequest) {
  try {
    const ain = await getAin();
    const data = await request.json() as { title?: string; content?: string; topicPath?: string; summary?: string; tags?: string[] };

    if (!data.title || !data.content) {
      return NextResponse.json({ error: 'title and content required' }, { status: 400 });
    }

    const topicPath = data.topicPath || 'lessons';
    const result = await ain.writeLesson(topicPath, {
      title: data.title,
      content: data.content,
      summary: data.summary || data.content.slice(0, 200),
      tags: data.tags || [],
    });

    return NextResponse.json({ success: true, entryId: result.entryId, topicPath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
