/**
 * A2A protocol setup — agent card + executor.
 * Uses @a2a-js/sdk for Google's Agent-to-Agent protocol.
 */

import { randomUUID } from 'crypto';
import type { AgentCard, Message } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
  type AgentExecutor,
  type RequestContext,
  type ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { config, AGENT_ID, ERC_8004_REGISTRY } from './config';
import { AinClient } from './ain-client';

export function buildAgentCard(): AgentCard {
  return {
    name: 'Cogito Node',
    description: 'Autonomous knowledge agent — reads arXiv papers, builds knowledge graph on AIN blockchain, earns via x402 on Base',
    url: config.agentBaseUrl,
    version: '0.1.0',
    protocolVersion: '0.3.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [
      {
        id: 'knowledge-exploration',
        name: 'Knowledge Exploration',
        description: 'Explore research topics with paper-grounded context from arXiv',
        tags: ['ai', 'research', 'papers', 'knowledge-graph'],
        examples: ['Explore transformer architecture', 'What are state-space models?'],
      },
      {
        id: 'paper-enrichment',
        name: 'Paper Enrichment',
        description: 'Enrich lessons with academic papers and their official GitHub code repositories',
        tags: ['papers', 'code', 'enrichment', 'github'],
        examples: ['Enrich a lesson about attention mechanisms'],
      },
    ],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
  };
}

function inferSkill(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('enrich') || lower.includes('paper') || lower.includes('lesson')) {
    return 'paper-enrichment';
  }
  return 'knowledge-exploration';
}

class CogitoExecutor implements AgentExecutor {
  constructor(private ain: AinClient) {}

  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const text = ctx.userMessage.parts
      .map((p: any) => p.text || '')
      .join('\n')
      .trim();

    const skillId = (ctx.userMessage.metadata?.skillId as string) || inferSkill(text);
    let responseText: string;

    if (skillId === 'knowledge-exploration') {
      const explorations = await this.ain.getAllExplorations();
      const matches: any[] = [];
      const query = text.toLowerCase();
      if (explorations) {
        for (const [topicKey, entries] of Object.entries(explorations)) {
          if (!entries || typeof entries !== 'object') continue;
          for (const [entryId, entry] of Object.entries(entries as Record<string, any>)) {
            const haystack = `${entry.title} ${entry.summary} ${entry.tags}`.toLowerCase();
            if (haystack.includes(query) || query.includes(topicKey.replace(/_/g, ' '))) {
              matches.push({ id: `${topicKey}/${entryId}`, title: entry.title, summary: entry.summary });
            }
          }
        }
      }
      responseText = matches.length > 0
        ? JSON.stringify({ matches: matches.slice(0, 10) })
        : `No explorations found matching "${text}".`;

    } else if (skillId === 'paper-enrichment') {
      const result = await this.ain.writeLesson('lessons', {
        title: text.slice(0, 100),
        content: text,
        summary: text.slice(0, 200),
        tags: ['a2a_task'],
      });
      responseText = JSON.stringify({
        status: 'accepted',
        entryId: result.entryId,
        message: 'Lesson recorded. The recipe watcher will enrich it with papers and code.',
      });

    } else {
      responseText = `Unknown skill "${skillId}". Available: knowledge-exploration, paper-enrichment`;
    }

    const response: Message = {
      kind: 'message',
      messageId: randomUUID(),
      role: 'agent',
      parts: [{ kind: 'text', text: responseText }],
      contextId: ctx.contextId,
    };
    bus.publish(response);
    bus.finished();
  }

  async cancelTask(_taskId: string, bus: ExecutionEventBus): Promise<void> {
    bus.finished();
  }
}

let _transport: JsonRpcTransportHandler | null = null;
let _handler: DefaultRequestHandler | null = null;

export function getA2ATransport(ain: AinClient): JsonRpcTransportHandler {
  if (!_transport) {
    const card = buildAgentCard();
    const executor = new CogitoExecutor(ain);
    _handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), executor);
    _transport = new JsonRpcTransportHandler(_handler);
  }
  return _transport;
}

export function getA2AHandler(ain: AinClient): DefaultRequestHandler {
  if (!_handler) getA2ATransport(ain);
  return _handler!;
}
