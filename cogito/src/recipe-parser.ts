/**
 * Recipe parser.
 * Parses YAML front matter + markdown body from a recipe string.
 *
 * Recipe format:
 * ---
 * name: paper-enrichment
 * version: 1
 * watch:
 *   tags: [lesson_learned]
 *   topics: ["lessons/*"]
 *   exclude_tags: [x402_gated, enriched]
 * output:
 *   tags: [x402_gated, enriched, educational]
 *   price: "0.005"
 *   depth: 3
 * llm:
 *   temperature: 0.7
 *   max_tokens: 4096
 * ---
 * (system prompt markdown body)
 */

import { ParsedRecipe, RecipeWatch, RecipeOutput, RecipeLlmConfig } from './types.js';

/**
 * Parse a recipe markdown string into a ParsedRecipe.
 * Uses a lightweight YAML front matter parser (no external deps).
 */
export function parseRecipe(markdown: string): ParsedRecipe {
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error('Recipe must have YAML front matter delimited by ---');
  }

  const yamlStr = fmMatch[1];
  const systemPrompt = fmMatch[2].trim();
  const fm = parseSimpleYaml(yamlStr);

  const watch: RecipeWatch = {
    tags: toStringArray(fm.watch?.tags),
    topics: toStringArray(fm.watch?.topics),
    exclude_tags: toStringArray(fm.watch?.exclude_tags),
  };

  const output: RecipeOutput = {
    tags: toStringArray(fm.output?.tags),
    price: String(fm.output?.price ?? '0'),
    depth: Number(fm.output?.depth ?? 3),
  };

  const llm: RecipeLlmConfig = {
    temperature: Number(fm.llm?.temperature ?? 0.7),
    max_tokens: Number(fm.llm?.max_tokens ?? 4096),
  };

  if (!fm.name) throw new Error('Recipe must have a "name" field');

  return {
    name: String(fm.name),
    version: Number(fm.version ?? 1),
    watch,
    output,
    llm,
    systemPrompt,
  };
}

/** Lightweight YAML-subset parser for front matter (handles nested objects, arrays). */
function parseSimpleYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');
  const stack: Array<{ obj: Record<string, any>; indent: number }> = [{ obj: result, indent: -1 }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Pop stack to find parent at correct indentation
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim();
    const value = kvMatch[2].trim();

    if (value === '' || value === undefined) {
      // Nested object — next lines will populate it
      const child: Record<string, any> = {};
      parent[key] = child;
      stack.push({ obj: child, indent });
    } else if (value.startsWith('[') && value.endsWith(']')) {
      // Inline array: [a, b, c]
      const inner = value.slice(1, -1);
      parent[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      // Scalar
      parent[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return result;
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return [val];
  return [];
}
