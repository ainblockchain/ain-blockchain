/**
 * AIN Blockchain client for the Cogito container.
 * Wraps ain-js to read knowledge graph entries and write enriched content.
 * Generalized from the domain-specific version in papers-with-claudecode.
 */

import AinModule from '@ainblockchain/ain-js';
import { ParsedRecipe } from './types.js';

/** Deserialize a recipe from blockchain state (comma-separated strings → arrays). */
function deserializeRecipe(raw: any): ParsedRecipe {
  const splitCsv = (v: unknown): string[] =>
    typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean)
    : Array.isArray(v) ? v.map(String) : [];

  return {
    name: raw.name,
    version: Number(raw.version ?? 1),
    watch: {
      tags: splitCsv(raw.watch?.tags),
      topics: splitCsv(raw.watch?.topics),
      exclude_tags: splitCsv(raw.watch?.exclude_tags),
    },
    output: {
      tags: splitCsv(raw.output?.tags),
      price: String(raw.output?.price ?? '0'),
      depth: Number(raw.output?.depth ?? 3),
    },
    llm: {
      temperature: Number(raw.llm?.temperature ?? 0.7),
      max_tokens: Number(raw.llm?.max_tokens ?? 4096),
    },
    systemPrompt: raw.systemPrompt || '',
    registered_at: raw.registered_at,
  };
}

// ESM/CJS interop: ain-js is CJS with `module.exports = class Ain`.
const Ain: any = (AinModule as any).default ?? AinModule;

export class AinClient {
  private ain: any;
  private address: string = '';

  static RECIPES_PATH = '/apps/cogito/recipes';

  constructor(
    private providerUrl: string,
    private privateKey: string,
  ) {
    this.ain = new Ain(providerUrl);
  }

  async init(): Promise<void> {
    this.address = this.ain.wallet.addAndSetDefaultAccount(this.privateKey);
    console.log(`[AIN] Initialized with address: ${this.address}`);

    try {
      await this.ain.knowledge.setupApp();
      console.log('[AIN] Knowledge app ready');
    } catch (err: any) {
      console.log(`[AIN] Knowledge app setup: ${err.message || 'skipped'}`);
    }
  }

  getAddress(): string {
    return this.address;
  }

  // ── Recipe management ──────────────────────────────────────────────

  /** Read all recipes registered by a given address (defaults to our own). */
  async getRecipes(address?: string): Promise<Record<string, ParsedRecipe>> {
    const addr = address || this.address;
    const data = await this.ain.db
      .ref(`${AinClient.RECIPES_PATH}/${addr}`)
      .getValue();
    if (!data) return {};
    // Deserialize: AIN state stores arrays as comma-separated strings
    const result: Record<string, ParsedRecipe> = {};
    for (const [key, raw] of Object.entries(data as Record<string, any>)) {
      result[key] = deserializeRecipe(raw);
    }
    return result;
  }

  // ── Knowledge graph access ─────────────────────────────────────────

  async registerTopic(topicPath: string): Promise<void> {
    const parts = topicPath.split('/');
    const title = parts[parts.length - 1].replace(/-/g, ' ');
    await this.ain.knowledge.registerTopic(topicPath, {
      title,
      description: `Explorations related to ${topicPath}`,
    });
    console.log(`[AIN] Registered topic: ${topicPath}`);
  }

  async getAllExplorations(): Promise<Record<string, any> | null> {
    return this.ain.knowledge.getExplorationsByUser(this.address);
  }

  async getExplorations(topicPath: string): Promise<Record<string, any> | null> {
    return this.ain.knowledge.getExplorations(this.address, topicPath);
  }

  async getExplorationsByAddress(address: string, topicPath: string): Promise<Record<string, any> | null> {
    return this.ain.knowledge.getExplorations(address, topicPath);
  }

  /** Write enriched content as a gated exploration. */
  async writeEnrichedContent(
    topicPath: string,
    content: { title: string; summary: string; content: string; tags: string[]; depth: number },
    price: string,
  ): Promise<{ entryId: string }> {
    try { await this.registerTopic(topicPath); } catch {}

    const result = await this.ain.knowledge.explore({
      topicPath,
      title: content.title,
      content: content.content,
      summary: content.summary,
      depth: Math.min(content.depth, 5) as 1 | 2 | 3 | 4 | 5,
      tags: content.tags.join(','),
      price,
    });

    console.log(`[AIN] Enriched content written: ${result.entryId}`);
    return { entryId: result.entryId };
  }

  async getFrontierMap(): Promise<Array<{ topic: string; stats: any }>> {
    return this.ain.knowledge.getFrontierMap();
  }

  async getGraph(): Promise<{ nodes: Record<string, any>; edges: Record<string, any> }> {
    return this.ain.knowledge.getGraph();
  }
}
