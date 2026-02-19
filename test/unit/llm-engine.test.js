const chai = require('chai');
const assert = chai.assert;

// We'll mock axios.post by replacing the module-level reference
// LlmEngine uses axios internally, so we intercept at the axios level.
const axios = require('axios');
const { stripThinkTags, extractJson } = require('../../db/llm-engine');

describe('LlmEngine', () => {
  let engine;
  let originalPost;
  let postCalls;

  beforeEach(() => {
    // Save original and replace with mock
    originalPost = axios.post;
    postCalls = [];

    // Fresh engine for each test
    const LlmEngine = require('../../db/llm-engine');
    engine = new LlmEngine({
      providerUrl: 'http://localhost:8000',
      model: 'Qwen/Qwen3-32B-AWQ',
    });
  });

  afterEach(() => {
    // Restore original
    axios.post = originalPost;
  });

  /**
   * Helper: set up a mock response for axios.post
   */
  function mockPost(response) {
    axios.post = function(...args) {
      postCalls.push(args);
      return Promise.resolve(response);
    };
  }

  function mockPostReject(error) {
    axios.post = function(...args) {
      postCalls.push(args);
      return Promise.reject(error);
    };
  }

  // ---------------------------------------------------------------------------
  // stripThinkTags
  // ---------------------------------------------------------------------------

  describe('stripThinkTags', () => {
    it('should remove a complete <think>...</think> block', () => {
      const input = '<think>\nLet me reason about this...\n</think>\n{"title":"Test"}';
      assert.equal(stripThinkTags(input), '{"title":"Test"}');
    });

    it('should remove multiple think blocks', () => {
      const input = '<think>first</think>middle<think>second</think>end';
      assert.equal(stripThinkTags(input), 'middleend');
    });

    it('should handle multiline think content', () => {
      const input = '<think>\nOkay, the user wants...\nLet me think about this.\nI should return JSON.\n</think>\n\n```json\n{"key":"val"}\n```';
      const result = stripThinkTags(input);
      assert.include(result, '```json');
      assert.notInclude(result, '<think>');
    });

    it('should remove unclosed <think> block (truncated output)', () => {
      const input = '<think>\nI am still thinking and got cut off by max_to';
      assert.equal(stripThinkTags(input), '');
    });

    it('should return original content when no think tags present', () => {
      const input = '{"title":"Test","content":"No thinking here"}';
      assert.equal(stripThinkTags(input), input);
    });

    it('should return original content for null/empty input', () => {
      assert.equal(stripThinkTags(null), null);
      assert.equal(stripThinkTags(''), '');
    });

    it('should trim whitespace after stripping', () => {
      const input = '  <think>thinking</think>  \n  result  \n  ';
      assert.equal(stripThinkTags(input), 'result');
    });
  });

  // ---------------------------------------------------------------------------
  // extractJson
  // ---------------------------------------------------------------------------

  describe('extractJson', () => {
    it('should parse clean JSON directly', () => {
      const result = extractJson('{"title":"Test","depth":1}');
      assert.equal(result.title, 'Test');
      assert.equal(result.depth, 1);
    });

    it('should strip think tags then parse JSON', () => {
      const input = '<think>\nOkay, I need to generate JSON.\n</think>\n{"title":"Attention","content":"...","summary":"s","depth":2,"tags":"ai"}';
      const result = extractJson(input);
      assert.equal(result.title, 'Attention');
      assert.equal(result.depth, 2);
    });

    it('should handle think tags with markdown code block', () => {
      const json = '{"title":"Test","content":"c","summary":"s","depth":1,"tags":"t"}';
      const input = '<think>\nLet me format this as JSON...\n</think>\n\n```json\n' + json + '\n```';
      const result = extractJson(input);
      assert.equal(result.title, 'Test');
    });

    it('should extract JSON object from surrounding text', () => {
      const input = 'Here is the result:\n{"title":"Found","depth":3}\nEnd.';
      const result = extractJson(input);
      assert.equal(result.title, 'Found');
      assert.equal(result.depth, 3);
    });

    it('should extract JSON array from surrounding text', () => {
      const input = 'Result: [{"a":1},{"b":2}] done';
      const result = extractJson(input);
      assert.isArray(result);
      assert.equal(result.length, 2);
    });

    it('should handle nested braces correctly', () => {
      const input = '<think>thinking</think>{"stages":[{"title":"S1","nested":{"key":"val"}}]}';
      const result = extractJson(input);
      assert.equal(result.stages[0].title, 'S1');
      assert.equal(result.stages[0].nested.key, 'val');
    });

    it('should handle braces inside JSON strings', () => {
      const input = '{"title":"Test {with} braces","depth":1}';
      const result = extractJson(input);
      assert.equal(result.title, 'Test {with} braces');
    });

    it('should throw when no valid JSON found', () => {
      try {
        extractJson('This has no JSON at all');
        assert.fail('Expected error not thrown');
      } catch (err) {
        assert.include(err.message, 'No valid JSON found');
      }
    });

    it('should throw for unclosed think block with no JSON', () => {
      try {
        extractJson('<think>still thinking and no JSON');
        assert.fail('Expected error not thrown');
      } catch (err) {
        assert.include(err.message, 'No valid JSON found');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      assert.equal(engine.providerUrl, 'http://localhost:8000');
      assert.equal(engine.model, 'Qwen/Qwen3-32B-AWQ');
      assert.isTrue(engine.isEnabled());
    });

    it('should use default values when config is empty', () => {
      const LlmEngine = require('../../db/llm-engine');
      const defaultEngine = new LlmEngine({});
      assert.equal(defaultEngine.providerUrl, 'http://localhost:8000');
      assert.equal(defaultEngine.model, 'Qwen/Qwen3-32B-AWQ');
    });
  });

  // ---------------------------------------------------------------------------
  // isEnabled
  // ---------------------------------------------------------------------------

  describe('isEnabled', () => {
    it('should return true after construction', () => {
      assert.isTrue(engine.isEnabled());
    });
  });

  // ---------------------------------------------------------------------------
  // infer
  // ---------------------------------------------------------------------------

  describe('infer', () => {
    it('should call vLLM OpenAI-compatible endpoint with correct params', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'Hello world' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
      });

      const result = await engine.infer({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100,
        temperature: 0.5,
      });

      assert.equal(result.content, 'Hello world');
      assert.equal(result.usage.prompt_tokens, 10);
      assert.equal(result.usage.completion_tokens, 5);

      // Verify call args
      assert.equal(postCalls.length, 1);
      const [url, body, opts] = postCalls[0];
      assert.equal(url, 'http://localhost:8000/v1/chat/completions');
      assert.equal(body.model, 'Qwen/Qwen3-32B-AWQ');
      assert.deepEqual(body.messages, [{ role: 'user', content: 'Hello' }]);
      assert.equal(body.max_tokens, 100);
      assert.equal(body.temperature, 0.5);
      assert.equal(opts.timeout, 120000);
    });

    it('should use default maxTokens=2048 and temperature=0.7', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'response' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        },
      });

      await engine.infer({ messages: [{ role: 'user', content: 'test' }] });

      const body = postCalls[0][1];
      assert.equal(body.max_tokens, 2048);
      assert.equal(body.temperature, 0.7);
    });

    it('should accept temperature=0 without falling back to default', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'deterministic' } }],
          usage: {},
        },
      });

      await engine.infer({
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0,
      });

      const body = postCalls[0][1];
      assert.equal(body.temperature, 0);
    });

    it('should return zero usage when response has no usage field', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'no usage' } }],
        },
      });

      const result = await engine.infer({ messages: [{ role: 'user', content: 'test' }] });
      assert.equal(result.usage.prompt_tokens, 0);
      assert.equal(result.usage.completion_tokens, 0);
    });

    it('should throw on HTTP error', async () => {
      mockPostReject(new Error('Connection refused'));

      try {
        await engine.infer({ messages: [{ role: 'user', content: 'test' }] });
        assert.fail('Expected error not thrown');
      } catch (err) {
        assert.include(err.message, 'LLM inference failed');
        assert.include(err.message, 'Connection refused');
      }
    });

    it('should throw on timeout', async () => {
      mockPostReject(new Error('timeout of 120000ms exceeded'));

      try {
        await engine.infer({ messages: [{ role: 'user', content: 'test' }] });
        assert.fail('Expected error not thrown');
      } catch (err) {
        assert.include(err.message, 'LLM inference failed');
        assert.include(err.message, 'timeout');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // explore
  // ---------------------------------------------------------------------------

  describe('explore', () => {
    it('should generate exploration JSON from topic path', async () => {
      const exploration = {
        title: 'Understanding Attention Mechanisms',
        content: 'Attention mechanisms allow models to focus...',
        summary: 'An overview of attention mechanisms in neural networks',
        depth: 2,
        tags: 'attention,transformers,neural-networks',
      };

      mockPost({
        data: {
          choices: [{ message: { content: JSON.stringify(exploration) } }],
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        },
      });

      const result = await engine.explore({ topicPath: 'ai/transformers' });

      assert.equal(result.title, exploration.title);
      assert.equal(result.content, exploration.content);
      assert.equal(result.summary, exploration.summary);
      assert.equal(result.depth, 2);
      assert.equal(result.tags, exploration.tags);

      // Check system prompt is passed
      const body = postCalls[0][1];
      assert.equal(body.messages[0].role, 'system');
      assert.include(body.messages[0].content, 'knowledge exploration expert');
      assert.include(body.messages[1].content, 'ai/transformers');
    });

    it('should include context and frontier in user message when provided', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: '{"title":"t","content":"c","summary":"s","depth":1,"tags":"t"}' } }],
          usage: {},
        },
      });

      await engine.explore({
        topicPath: 'ai/rl',
        context: 'Previous exploration covered Q-learning',
        frontier: { explorer_count: 3, max_depth: 2 },
      });

      const body = postCalls[0][1];
      const userMsg = body.messages[1].content;
      assert.include(userMsg, 'ai/rl');
      assert.include(userMsg, 'Previous exploration covered Q-learning');
      assert.include(userMsg, 'explorer_count');
    });

    it('should parse JSON from markdown code block fallback', async () => {
      const exploration = { title: 'Test', content: 'Content', summary: 'Sum', depth: 1, tags: 'test' };
      const markdownResponse = '```json\n' + JSON.stringify(exploration) + '\n```';

      mockPost({
        data: {
          choices: [{ message: { content: markdownResponse } }],
          usage: {},
        },
      });

      const result = await engine.explore({ topicPath: 'test/topic' });
      assert.equal(result.title, 'Test');
      assert.equal(result.depth, 1);
    });

    it('should parse JSON from code block without json language tag', async () => {
      const exploration = { title: 'Test', content: 'Content', summary: 'Sum', depth: 1, tags: 'test' };
      const markdownResponse = '```\n' + JSON.stringify(exploration) + '\n```';

      mockPost({
        data: {
          choices: [{ message: { content: markdownResponse } }],
          usage: {},
        },
      });

      const result = await engine.explore({ topicPath: 'test/topic' });
      assert.equal(result.title, 'Test');
    });

    it('should parse JSON after stripping <think> tags (Qwen3)', async () => {
      const exploration = { title: 'Qwen3 Exploration', content: 'Content', summary: 'Sum', depth: 2, tags: 'ai' };
      const thinkResponse = '<think>\nOkay, I need to generate a JSON exploration about transformers.\nLet me think about the structure...\n</think>\n' + JSON.stringify(exploration);

      mockPost({
        data: {
          choices: [{ message: { content: thinkResponse } }],
          usage: {},
        },
      });

      const result = await engine.explore({ topicPath: 'ai/transformers' });
      assert.equal(result.title, 'Qwen3 Exploration');
      assert.equal(result.depth, 2);
    });

    it('should parse JSON from think tags + markdown code block', async () => {
      const exploration = { title: 'Think+MD', content: 'c', summary: 's', depth: 1, tags: 't' };
      const response = '<think>\nFormatting as JSON...\n</think>\n\n```json\n' + JSON.stringify(exploration) + '\n```';

      mockPost({
        data: {
          choices: [{ message: { content: response } }],
          usage: {},
        },
      });

      const result = await engine.explore({ topicPath: 'test' });
      assert.equal(result.title, 'Think+MD');
    });

    it('should extract JSON embedded in think-tag prose', async () => {
      const exploration = { title: 'Embedded', content: 'c', summary: 's', depth: 3, tags: 't' };
      const response = '<think>reasoning</think>\nHere is the exploration:\n' + JSON.stringify(exploration) + '\n\nI hope this helps!';

      mockPost({
        data: {
          choices: [{ message: { content: response } }],
          usage: {},
        },
      });

      const result = await engine.explore({ topicPath: 'test' });
      assert.equal(result.title, 'Embedded');
      assert.equal(result.depth, 3);
    });

    it('should throw when response is not valid JSON', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'This is not JSON at all' } }],
          usage: {},
        },
      });

      try {
        await engine.explore({ topicPath: 'test/topic' });
        assert.fail('Expected error not thrown');
      } catch (err) {
        assert.include(err.message, 'Failed to parse LLM explore response as JSON');
      }
    });

    it('should use maxTokens=4096 and temperature=0.8', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: '{"title":"t","content":"c","summary":"s","depth":1,"tags":""}' } }],
          usage: {},
        },
      });

      await engine.explore({ topicPath: 'test' });

      const body = postCalls[0][1];
      assert.equal(body.max_tokens, 4096);
      assert.equal(body.temperature, 0.8);
    });
  });

  // ---------------------------------------------------------------------------
  // generateCourse
  // ---------------------------------------------------------------------------

  describe('generateCourse', () => {
    it('should generate course stages from explorations', async () => {
      const courseResponse = {
        stages: [
          { title: 'Stage 1: Intro', content: 'Introduction to...', exercise: 'What is...?' },
          { title: 'Stage 2: Deep', content: 'In depth...', exercise: 'Explain...' },
        ],
      };

      mockPost({
        data: {
          choices: [{ message: { content: JSON.stringify(courseResponse) } }],
          usage: {},
        },
      });

      const result = await engine.generateCourse({
        topicPath: 'ai/transformers',
        explorations: [
          { title: 'Attention', depth: 1, summary: 'Basic attention' },
          { title: 'Multi-Head', depth: 2, summary: 'Multi-head attention' },
        ],
      });

      assert.isArray(result.stages);
      assert.equal(result.stages.length, 2);
      assert.equal(result.stages[0].title, 'Stage 1: Intro');
      assert.isString(result.stages[0].exercise);
    });

    it('should format exploration summaries in user message', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: '{"stages":[]}' } }],
          usage: {},
        },
      });

      await engine.generateCourse({
        topicPath: 'ai/rl',
        explorations: [
          { title: 'Q-Learning', depth: 1, summary: 'Tabular Q-learning basics' },
        ],
      });

      const body = postCalls[0][1];
      assert.include(body.messages[1].content, 'ai/rl');
      assert.include(body.messages[1].content, 'Q-Learning');
      assert.include(body.messages[1].content, 'Tabular Q-learning basics');
    });

    it('should use maxTokens=8192 and temperature=0.6', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: '{"stages":[]}' } }],
          usage: {},
        },
      });

      await engine.generateCourse({ topicPath: 'test', explorations: [] });

      const body = postCalls[0][1];
      assert.equal(body.max_tokens, 8192);
      assert.equal(body.temperature, 0.6);
    });

    it('should handle markdown code block response', async () => {
      const courseResponse = { stages: [{ title: 'S1', content: 'C', exercise: 'E' }] };
      mockPost({
        data: {
          choices: [{ message: { content: '```json\n' + JSON.stringify(courseResponse) + '\n```' } }],
          usage: {},
        },
      });

      const result = await engine.generateCourse({ topicPath: 'test', explorations: [] });
      assert.equal(result.stages.length, 1);
    });

    it('should parse course JSON after stripping <think> tags (Qwen3)', async () => {
      const courseResponse = { stages: [{ title: 'S1', content: 'Lesson', exercise: 'Quiz' }] };
      const thinkResponse = '<think>\nLet me design a course with progressive stages...\n</think>\n' + JSON.stringify(courseResponse);

      mockPost({
        data: {
          choices: [{ message: { content: thinkResponse } }],
          usage: {},
        },
      });

      const result = await engine.generateCourse({ topicPath: 'ai/transformers', explorations: [] });
      assert.equal(result.stages.length, 1);
      assert.equal(result.stages[0].title, 'S1');
    });

    it('should throw on unparseable response', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'Not JSON' } }],
          usage: {},
        },
      });

      try {
        await engine.generateCourse({ topicPath: 'test', explorations: [] });
        assert.fail('Expected error not thrown');
      } catch (err) {
        assert.include(err.message, 'Failed to parse LLM course response as JSON');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // analyze
  // ---------------------------------------------------------------------------

  describe('analyze', () => {
    it('should return analysis text from context nodes', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'Attention mechanisms specialize by learning different subspaces...' } }],
          usage: { prompt_tokens: 200, completion_tokens: 100 },
        },
      });

      const result = await engine.analyze({
        question: 'How do attention heads specialize?',
        contextNodes: [
          { title: 'Self-Attention', topic_path: 'ai/transformers', depth: 2, summary: 'Self-attention overview' },
          { title: 'Multi-Head', topic_path: 'ai/transformers', depth: 3, content: 'Multi-head details' },
        ],
      });

      assert.isString(result);
      assert.include(result, 'Attention mechanisms specialize');
    });

    it('should format context nodes in user message', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'Analysis result' } }],
          usage: {},
        },
      });

      await engine.analyze({
        question: 'What is a transformer?',
        contextNodes: [
          { title: 'Transformers 101', topic_path: 'ai/transformers', depth: 1, summary: 'Basic intro' },
        ],
      });

      const body = postCalls[0][1];
      assert.include(body.messages[0].content, 'knowledge analyst');
      assert.include(body.messages[1].content, 'What is a transformer?');
      assert.include(body.messages[1].content, 'Transformers 101');
      assert.include(body.messages[1].content, 'ai/transformers');
    });

    it('should use maxTokens=4096 and temperature=0.5', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'result' } }],
          usage: {},
        },
      });

      await engine.analyze({ question: 'q', contextNodes: [] });

      const body = postCalls[0][1];
      assert.equal(body.max_tokens, 4096);
      assert.equal(body.temperature, 0.5);
    });

    it('should handle nodes with content field instead of summary', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'result' } }],
          usage: {},
        },
      });

      await engine.analyze({
        question: 'q',
        contextNodes: [
          { title: 'Node', topic_path: 'test', depth: 1, content: 'Full content here' },
        ],
      });

      const body = postCalls[0][1];
      assert.include(body.messages[1].content, 'Full content here');
    });

    it('should strip think tags from analysis output', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: '<think>\nLet me analyze the context...\n</think>\n\nThe key innovation is self-attention.' } }],
          usage: {},
        },
      });

      const result = await engine.analyze({
        question: 'What is the key innovation?',
        contextNodes: [{ title: 'Transformers', topic_path: 'ai', depth: 1, summary: 'Attention' }],
      });

      assert.notInclude(result, '<think>');
      assert.notInclude(result, '</think>');
      assert.include(result, 'The key innovation is self-attention.');
    });

    it('should handle empty context nodes', async () => {
      mockPost({
        data: {
          choices: [{ message: { content: 'No context available' } }],
          usage: {},
        },
      });

      const result = await engine.analyze({ question: 'q', contextNodes: [] });
      assert.equal(result, 'No context available');
    });
  });
});
