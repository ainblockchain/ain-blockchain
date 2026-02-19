const logger = new (require('../logger'))('LLM_ENGINE');

const axios = require('axios');

const EXPLORE_SYSTEM_PROMPT = `You are a knowledge exploration expert. Given a topic path and context about existing explorations, generate a new exploration that extends the frontier of understanding.

Return ONLY valid JSON (no markdown, no commentary, no thinking) with these keys:
- title: a concise title for this exploration
- content: detailed content (500-1500 words) covering the topic in depth
- summary: a 1-2 sentence summary
- depth: integer 1-5 indicating depth level (1=intro, 5=cutting-edge)
- tags: comma-separated relevant tags`;

const COURSE_SYSTEM_PROMPT = `You are a course designer. Given a topic path and a list of explorations, design a structured course with progressive stages.

Each stage should build on previous ones. Return ONLY valid JSON (no markdown, no commentary, no thinking) with key "stages", where each stage has:
- title: stage title
- content: lesson content (300-800 words)
- exercise: one quiz-style exercise (multiple choice, fill-in-blank, or short answer)`;

const ANALYZE_SYSTEM_PROMPT = `You are a knowledge analyst. Given a question and context from a knowledge graph, provide a thorough analysis that synthesizes information from the provided context nodes.

Be concise but comprehensive. Cite specific concepts from the context when relevant.`;

/**
 * Strip Qwen3-style <think>...</think> reasoning blocks from LLM output.
 * Handles complete blocks, unclosed blocks (from max_tokens truncation),
 * and multiple blocks. Returns the remaining content trimmed.
 */
function stripThinkTags(content) {
  if (!content) return content;
  // Remove complete <think>...</think> blocks (multiline)
  let stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  // Remove unclosed <think> block (truncated output)
  stripped = stripped.replace(/<think>[\s\S]*/g, '');
  return stripped.trim();
}

/**
 * Extract and parse JSON from LLM output, handling:
 * 1. <think> tags (Qwen3 reasoning mode)
 * 2. Markdown ```json code blocks
 * 3. Bare JSON with surrounding text
 * @param {string} raw Raw LLM output
 * @returns {object} Parsed JSON object
 * @throws {Error} If no valid JSON can be extracted
 */
function extractJson(raw) {
  const content = stripThinkTags(raw);

  // 1. Try direct parse
  try {
    return JSON.parse(content);
  } catch (_) { /* continue */ }

  // 2. Try markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (_) { /* continue */ }
  }

  // 3. Try finding the outermost { ... } or [ ... ]
  const firstBrace = content.indexOf('{');
  const firstBracket = content.indexOf('[');
  let start = -1;
  let openChar = '{';
  let closeChar = '}';
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace <= firstBracket)) {
    start = firstBrace;
  } else if (firstBracket >= 0) {
    start = firstBracket;
    openChar = '[';
    closeChar = ']';
  }
  if (start >= 0) {
    // Walk forward to find the matching close bracket
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === openChar) depth++;
      if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(content.substring(start, i + 1));
          } catch (_) { break; }
        }
      }
    }
  }

  throw new Error('No valid JSON found in LLM response');
}

/**
 * LLM inference engine that calls a vLLM-compatible OpenAI API.
 * Runs inside the AIN blockchain node, called by JSON-RPC handlers.
 */
class LlmEngine {
  /**
   * @param {object} config
   * @param {string} config.providerUrl Base URL for the vLLM server (e.g. http://localhost:8000)
   * @param {string} config.model Model identifier (e.g. Qwen/Qwen3-32B-AWQ)
   */
  constructor(config) {
    this.providerUrl = config.providerUrl || 'http://localhost:8000';
    this.model = config.model || 'Qwen/Qwen3-32B-AWQ';
    this._enabled = true;
    logger.info(`LLM Engine initialized: provider=${this.providerUrl}, model=${this.model}`);
  }

  isEnabled() {
    return this._enabled;
  }

  /**
   * General chat inference via vLLM OpenAI-compatible API.
   * @param {object} params
   * @param {Array<{role: string, content: string}>} params.messages
   * @param {number} [params.maxTokens=2048]
   * @param {number} [params.temperature=0.7]
   * @returns {Promise<{content: string, usage: {prompt_tokens: number, completion_tokens: number}}>}
   */
  async infer({ messages, maxTokens, temperature }) {
    const url = `${this.providerUrl}/v1/chat/completions`;
    const body = {
      model: this.model,
      messages,
      max_tokens: maxTokens || 2048,
      temperature: temperature !== undefined ? temperature : 0.7,
    };

    try {
      const response = await axios.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000,
      });
      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        usage: response.data.usage || { prompt_tokens: 0, completion_tokens: 0 },
      };
    } catch (err) {
      logger.error(`LLM infer failed: ${err.message}`);
      throw new Error(`LLM inference failed: ${err.message}`);
    }
  }

  /**
   * Generate a knowledge exploration for a topic.
   * @param {object} params
   * @param {string} params.topicPath e.g. "ai/transformers"
   * @param {string} [params.context] Existing exploration summaries for context
   * @param {object} [params.frontier] Current frontier map stats
   * @returns {Promise<{title: string, content: string, summary: string, depth: number, tags: string}>}
   */
  async explore({ topicPath, context, frontier }) {
    const userMessage = [
      `Topic: ${topicPath}`,
      context ? `\nExisting explorations context:\n${context}` : '',
      frontier ? `\nFrontier stats: ${JSON.stringify(frontier)}` : '',
      '\nGenerate a new exploration that advances understanding of this topic.',
    ].join('');

    const result = await this.infer({
      messages: [
        { role: 'system', content: EXPLORE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      maxTokens: 4096,
      temperature: 0.8,
    });

    try {
      return extractJson(result.content);
    } catch (parseErr) {
      logger.error(`Failed to parse explore response: ${result.content.substring(0, 200)}`);
      throw new Error('Failed to parse LLM explore response as JSON');
    }
  }

  /**
   * Generate course stages from explorations.
   * @param {object} params
   * @param {string} params.topicPath
   * @param {Array<object>} params.explorations
   * @returns {Promise<{stages: Array<{title: string, content: string, exercise: string}>}>}
   */
  async generateCourse({ topicPath, explorations }) {
    const explorationSummaries = explorations.map((e, i) =>
      `${i + 1}. "${e.title}" (depth ${e.depth}): ${e.summary}`
    ).join('\n');

    const result = await this.infer({
      messages: [
        { role: 'system', content: COURSE_SYSTEM_PROMPT },
        { role: 'user', content: `Topic: ${topicPath}\n\nExplorations:\n${explorationSummaries}\n\nDesign a course with progressive stages based on these explorations.` },
      ],
      maxTokens: 8192,
      temperature: 0.6,
    });

    try {
      return extractJson(result.content);
    } catch (parseErr) {
      logger.error(`Failed to parse course response: ${result.content.substring(0, 200)}`);
      throw new Error('Failed to parse LLM course response as JSON');
    }
  }

  /**
   * Analyze a question given context nodes from the knowledge graph.
   * @param {object} params
   * @param {string} params.question
   * @param {Array<object>} params.contextNodes
   * @returns {Promise<string>}
   */
  async analyze({ question, contextNodes }) {
    const contextText = contextNodes.map((n, i) =>
      `[${i + 1}] "${n.title}" (${n.topic_path}, depth ${n.depth}): ${n.summary || n.content || ''}`
    ).join('\n\n');

    const result = await this.infer({
      messages: [
        { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
        { role: 'user', content: `Question: ${question}\n\nContext from knowledge graph:\n${contextText}` },
      ],
      maxTokens: 4096,
      temperature: 0.5,
    });

    return stripThinkTags(result.content);
  }
}

module.exports = LlmEngine;
module.exports.stripThinkTags = stripThinkTags;
module.exports.extractJson = extractJson;
