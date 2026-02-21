/**
 * AIN Blockchain client for the Cogito container.
 * Wraps ain-js to read knowledge graph entries and write enriched content.
 */

import AinModule from '@ainblockchain/ain-js';

// ESM/CJS interop: ain-js is CJS with `module.exports = class Ain`.
const Ain: any = (AinModule as any).default ?? AinModule;

export class AinClient {
  private ain: any;
  private address: string = '';

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

  /** Write a lesson_learned exploration (used by the /lesson skill and A2A task handler). */
  async writeLesson(
    topicPath: string,
    lesson: { title: string; content: string; summary: string; tags: string[] },
  ): Promise<{ entryId: string }> {
    try { await this.registerTopic(topicPath); } catch {}

    const result = await this.ain.knowledge.explore({
      topicPath,
      title: lesson.title,
      content: lesson.content,
      summary: lesson.summary,
      depth: 2 as 1 | 2 | 3 | 4 | 5,
      tags: ['lesson_learned', ...lesson.tags].join(','),
    });

    console.log(`[AIN] Lesson written: ${result.entryId}`);
    return { entryId: result.entryId };
  }

  async getFrontierMap(): Promise<Array<{ topic: string; stats: any }>> {
    return this.ain.knowledge.getFrontierMap();
  }

  async getGraph(): Promise<{ nodes: Record<string, any>; edges: Record<string, any> }> {
    return this.ain.knowledge.getGraph();
  }

  // ── ERC-8004 agent registry on AIN state ────────────────────────────

  static AGENTS_PATH = '/apps/knowledge/agents';

  /** Register an ERC-8004 agent ID in the AIN agents list after on-chain registration succeeds. */
  async registerAgentId(agentId: number, registry: string, baseAddress: string): Promise<void> {
    await this.ain.db.ref(`${AinClient.AGENTS_PATH}/${agentId}`).setValue({
      value: {
        registry,
        base_address: baseAddress,
        registered_at: Date.now(),
      },
      nonce: -1,
    });
    console.log(`[AIN] Agent #${agentId} added to agents list`);
  }

  /** Get the list of all registered ERC-8004 agent IDs. */
  async getAgentIds(): Promise<Record<string, any> | null> {
    return this.ain.db.ref(AinClient.AGENTS_PATH).getValue();
  }
}
