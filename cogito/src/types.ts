/**
 * Shared types for the Cogito container.
 */

/** YAML front matter from a recipe file. */
export interface RecipeWatch {
  tags: string[];
  topics: string[];
  exclude_tags: string[];
}

export interface RecipeOutput {
  tags: string[];
  price: string;
  depth: number;
}

export interface RecipeLlmConfig {
  temperature: number;
  max_tokens: number;
}

/** A fully parsed recipe (front matter + markdown body). */
export interface ParsedRecipe {
  name: string;
  version: number;
  watch: RecipeWatch;
  output: RecipeOutput;
  llm: RecipeLlmConfig;
  systemPrompt: string;
  registered_at?: number;
}

/** A knowledge graph entry that matched a recipe's watch criteria. */
export interface MatchedEntry {
  topicKey: string;
  entryId: string;
  title: string;
  content: string;
  summary: string;
  depth: number;
  tags: string;
  created_at: number;
}

/** Result of enriching a matched entry via an LLM. */
export interface ThinkResult {
  title: string;
  summary: string;
  content: string;
  tags: string[];
}

export interface ContentListing {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  price: string;
  created_at: number;
}
