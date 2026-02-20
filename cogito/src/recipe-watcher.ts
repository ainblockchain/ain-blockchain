/**
 * Recipe Watcher.
 * Generalized from the domain-specific LessonWatcher.
 *
 * On startup: reads recipes from /apps/cogito/recipes/{address}/
 * For each recipe: polls KG, matches entries by watch criteria,
 * enriches via vLLM with the recipe's system prompt, publishes results.
 */

import { AinClient } from './ain-client.js';
import { BaseChain } from './base-chain.js';
import { config } from './config.js';
import { ParsedRecipe, MatchedEntry, ThinkResult } from './types.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class RecipeWatcher {
  private processedEntries = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private recipes: ParsedRecipe[] = [];
  private initialScanDone = false;
  private baseChain: BaseChain | null = null;

  constructor(private ain: AinClient, baseChain?: BaseChain) {
    this.baseChain = baseChain ?? null;
  }

  /** Load recipes from blockchain state then start polling. */
  async start(): Promise<void> {
    await this.loadRecipes();
    if (this.recipes.length === 0) {
      console.log('[Watcher] No recipes found — will poll for new recipes each interval');
    }

    console.log(`[Watcher] Polling every ${config.pollIntervalMs}ms with ${this.recipes.length} recipe(s)`);

    this.poll().catch(err => console.error(`[Watcher] Poll error: ${err.message}`));
    this.timer = setInterval(() => {
      this.poll().catch(err => console.error(`[Watcher] Poll error: ${err.message}`));
    }, config.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getRecipes(): ParsedRecipe[] {
    return this.recipes;
  }

  // ── Private ────────────────────────────────────────────────────────

  private async loadRecipes(): Promise<void> {
    try {
      const data = await this.ain.getRecipes();
      this.recipes = Object.values(data).filter(r => r && r.name);
      console.log(`[Watcher] Loaded ${this.recipes.length} recipe(s): ${this.recipes.map(r => r.name).join(', ')}`);
    } catch (err: any) {
      console.log(`[Watcher] Failed to load recipes: ${err.message}`);
    }
  }

  private async poll(): Promise<void> {
    // Periodically reload recipes to pick up new registrations
    if (this.initialScanDone) {
      await this.loadRecipes();
    }

    const explorations = await this.ain.getAllExplorations();
    if (!explorations) return;

    // Collect already-enriched titles for deduplication on initial scan
    const enrichedTitles = new Set<string>();
    if (!this.initialScanDone) {
      for (const [, entries] of Object.entries(explorations)) {
        if (!entries || typeof entries !== 'object') continue;
        for (const [, entry] of Object.entries(entries as Record<string, any>)) {
          const tags = (entry.tags || '').toLowerCase();
          if (tags.includes('x402_gated') || tags.includes('enriched')) {
            enrichedTitles.add((entry.title || '').toLowerCase());
          }
        }
      }
    }

    const pendingWork: Array<{ recipe: ParsedRecipe; match: MatchedEntry }> = [];

    for (const recipe of this.recipes) {
      for (const [topicKey, entries] of Object.entries(explorations)) {
        if (!entries || typeof entries !== 'object') continue;

        // Check topic glob: "lessons/*" matches "lessons_architecture" etc.
        if (!this.matchesTopic(topicKey, recipe.watch.topics)) continue;

        for (const [entryId, entry] of Object.entries(entries as Record<string, any>)) {
          const fullId = `${recipe.name}:${topicKey}/${entryId}`;
          if (this.processedEntries.has(fullId)) continue;

          const entryTags = (entry.tags || '').split(',').map((t: string) => t.trim().toLowerCase());

          // Must have at least one watch tag
          const hasWatchTag = recipe.watch.tags.some(wt =>
            entryTags.includes(wt.toLowerCase())
          );
          if (!hasWatchTag) {
            this.processedEntries.add(fullId);
            continue;
          }

          // Must NOT have any exclude tags
          const hasExcludeTag = recipe.watch.exclude_tags.some(et =>
            entryTags.includes(et.toLowerCase())
          );
          if (hasExcludeTag) {
            this.processedEntries.add(fullId);
            continue;
          }

          const match: MatchedEntry = {
            topicKey,
            entryId,
            title: entry.title || 'Untitled',
            content: entry.content || entry.summary || '',
            summary: entry.summary || '',
            depth: entry.depth || 2,
            tags: entry.tags || '',
            created_at: entry.created_at || Date.now(),
          };

          // On first scan: skip if already enriched
          if (!this.initialScanDone) {
            const titleLower = match.title.toLowerCase();
            const alreadyEnriched = [...enrichedTitles].some(t =>
              t.includes(titleLower.slice(0, 30)) || titleLower.includes(t.slice(0, 30))
            );
            if (alreadyEnriched) {
              this.processedEntries.add(fullId);
              continue;
            }
            pendingWork.push({ recipe, match });
            this.processedEntries.add(fullId);
            continue;
          }

          // Live: process immediately
          console.log(`[Watcher] New match for "${recipe.name}": "${match.title}" (${fullId})`);
          await this.processEntry(recipe, match);
          this.processedEntries.add(fullId);
        }
      }
    }

    if (!this.initialScanDone) {
      this.initialScanDone = true;
      console.log(`[Watcher] Initial scan: ${this.processedEntries.size} entries catalogued, ${pendingWork.length} to enrich`);

      for (const { recipe, match } of pendingWork) {
        console.log(`[Watcher] Enriching backlog (${recipe.name}): "${match.title}"`);
        await this.processEntry(recipe, match);
      }
      if (pendingWork.length > 0) {
        console.log(`[Watcher] Backlog complete — ${pendingWork.length} entries enriched`);
      }
    }
  }

  /** Check if a topicKey matches any of the recipe's topic globs. */
  private matchesTopic(topicKey: string, topicGlobs: string[]): boolean {
    if (topicGlobs.length === 0) return true; // no filter = match all
    const normalized = topicKey.replace(/_/g, '/');
    return topicGlobs.some(glob => {
      if (glob === '*' || glob === '**') return true;
      const pattern = glob.replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(normalized);
    });
  }

  /** Enrich a single entry using the recipe's LLM config and system prompt. */
  private async processEntry(recipe: ParsedRecipe, entry: MatchedEntry): Promise<void> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: recipe.systemPrompt },
        {
          role: 'user',
          content: [
            `## Entry to Process`,
            '',
            `**Title:** ${entry.title}`,
            `**Content:** ${entry.content}`,
            `**Tags:** ${entry.tags}`,
            `**Depth:** ${entry.depth}`,
            '',
            'Return ONLY valid JSON with fields: { title, summary, content, tags }',
          ].join('\n'),
        },
      ];

      const raw = await this.callLlm(messages, recipe.llm);
      const result = this.parseThinkResult(raw, entry);

      // Merge output tags from recipe
      const allTags = [...new Set([...result.tags, ...recipe.output.tags])];

      const topicPath = entry.topicKey.replace(/_/g, '/');
      await this.ain.writeEnrichedContent(
        topicPath,
        {
          title: result.title,
          summary: result.summary,
          content: result.content,
          tags: allTags,
          depth: Math.min(recipe.output.depth, 5),
        },
        recipe.output.price,
      );

      console.log(`[Watcher] Published "${result.title}" (recipe: ${recipe.name})`);

      if (this.baseChain) {
        await this.baseChain.recordAttribution(topicPath, entry);
      }
    } catch (err: any) {
      console.error(`[Watcher] Failed to process "${entry.title}" with recipe "${recipe.name}": ${err.message}`);
    }
  }

  private async callLlm(messages: ChatMessage[], llmConfig: { temperature: number; max_tokens: number }): Promise<string> {
    const res = await fetch(`${config.vllmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.vllmModel,
        messages,
        max_tokens: llmConfig.max_tokens,
        temperature: llmConfig.temperature,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`vLLM error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;
    return data.choices[0]?.message?.content || '';
  }

  private parseThinkResult(raw: string, fallback: MatchedEntry): ThinkResult {
    // Strip <think>...</think> blocks
    let text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Try direct JSON parse
    try { return JSON.parse(text); } catch {}

    // Try markdown code fence
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      try { return JSON.parse(fenceMatch[1].trim()); } catch {}
    }

    // Try finding JSON object boundaries
    const start = text.indexOf('{');
    if (start >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch { break; }
        }}
      }
    }

    // Fallback
    return {
      title: `Enriched: ${fallback.title}`,
      summary: fallback.summary || fallback.content.slice(0, 200),
      content: text || raw,
      tags: fallback.tags.split(',').map(t => t.trim()),
    };
  }
}
