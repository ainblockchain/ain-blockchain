/**
 * POST /api/publication
 *
 * Triggers the agent loop to enrich a knowledge graph entry.
 * Replaces the old recipe-watcher polling loop with explicit API calls.
 * A2A executor can also call this internally.
 *
 * Body: { topicPath: string, entryId: string }
 *
 * 1. Read entry from KG
 * 2. Run agent loop (vLLM + MCP tools)
 * 3. Write enriched result to KG
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAin, getMcpClient } from '@/lib/globals';
import { runAgentLoop } from '@/lib/agent-loop';
import { config } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const { topicPath, entryId } = (await req.json()) as { topicPath: string; entryId: string };

    if (!topicPath || !entryId) {
      return NextResponse.json({ error: 'topicPath and entryId are required' }, { status: 400 });
    }

    const ain = await getAin();
    const mcpClient = await getMcpClient();

    if (!mcpClient.isConnected()) {
      return NextResponse.json({ error: 'MCP client not connected' }, { status: 503 });
    }

    // 1. Read entry from KG
    const explorations = await ain.getExplorations(topicPath);
    const entry = explorations?.[entryId];

    if (!entry) {
      return NextResponse.json({ error: `Entry ${entryId} not found in ${topicPath}` }, { status: 404 });
    }

    // 2. Run agent loop (vLLM reasons, MCP provides tools)
    const systemPrompt = [
      'You are a research publication assistant. Given a lesson or topic, use the available tools to:',
      '1. First call check_publication_status with the topic path and title to verify no enriched duplicate exists',
      '2. If canPublish is false, respond with exactly "DUPLICATE: <reason>" and do NOT call any other tools',
      '3. If canPublish is true, search arXiv for related academic papers',
      '4. Find GitHub repositories for the most relevant papers',
      '5. Create a publication guide combining the lesson with papers and code',
      '',
      'Always call check_publication_status BEFORE any other tool.',
    ].join('\n');

    const userMessage = [
      `## Topic: ${entry.title || 'Untitled'}`,
      '',
      entry.content || entry.summary || '',
      '',
      `Tags: ${entry.tags || ''}`,
    ].join('\n');

    const result = await runAgentLoop(
      mcpClient,
      config.vllmUrl,
      config.vllmModel,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    );

    if (result.startsWith('DUPLICATE:')) {
      return NextResponse.json(
        { error: result, duplicate: true },
        { status: 409 },
      );
    }

    // 3. Parse the result and write to KG
    let enriched: { title: string; summary: string; content: string; tags: string[] };
    try {
      enriched = JSON.parse(result);
    } catch {
      enriched = {
        title: `Publication Guide: ${entry.title}`,
        summary: result.slice(0, 200),
        content: result,
        tags: (entry.tags || '').split(',').map((t: string) => t.trim()),
      };
    }

    const writeResult = await ain.writeEnrichedContent(
      topicPath,
      { ...enriched, depth: Math.min((entry.depth || 2) + 1, 5) },
      config.contentPrice,
    );

    return NextResponse.json({
      success: true,
      entryId: writeResult.entryId,
      title: enriched.title,
    });
  } catch (err: any) {
    console.error(`[Publication] Error: ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
