const chai = require('chai');
const assert = chai.assert;
const getLlmApis = require('../../json_rpc/llm');

/**
 * Helper: creates a mock node with a mock llmEngine.
 */
function createMockNode(engineOverrides = {}) {
  return {
    llmEngine: {
      isEnabled: () => true,
      infer: () => Promise.resolve({ content: 'response', usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      explore: () => Promise.resolve({ title: 'T', content: 'C', summary: 'S', depth: 2, tags: 'test' }),
      generateCourse: () => Promise.resolve({ stages: [{ title: 'S1', content: 'C1', exercise: 'E1' }] }),
      analyze: () => Promise.resolve('Analysis text'),
      ...engineOverrides,
    },
  };
}

/**
 * Helper: wraps a callback-style JSON-RPC handler into a promise.
 */
function callApi(handler, args) {
  return new Promise((resolve) => {
    handler(args, (err, result) => resolve({ err, result }));
  });
}

describe('LLM JSON-RPC Handlers', () => {
  // ---------------------------------------------------------------------------
  // ain_llm_infer
  // ---------------------------------------------------------------------------

  describe('ain_llm_infer', () => {
    it('should call llmEngine.infer and return result', async () => {
      let capturedArgs = null;
      const node = createMockNode({
        infer: (args) => {
          capturedArgs = args;
          return Promise.resolve({ content: 'test response', usage: { prompt_tokens: 10, completion_tokens: 5 } });
        },
      });
      const apis = getLlmApis(node);

      const { err, result } = await callApi(apis['ain_llm_infer'], {
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
        temperature: 0.5,
      });

      assert.isNull(err);
      assert.isObject(result);
      assert.equal(result.result.content, 'test response');
      assert.equal(result.result.usage.prompt_tokens, 10);

      // Verify args passed to engine
      assert.deepEqual(capturedArgs.messages, [{ role: 'user', content: 'Hello' }]);
      assert.equal(capturedArgs.maxTokens, 100);
      assert.equal(capturedArgs.temperature, 0.5);
    });

    it('should return error 30801 when LLM engine is not enabled', async () => {
      const node = createMockNode({ isEnabled: () => false });
      const apis = getLlmApis(node);

      const { err, result } = await callApi(apis['ain_llm_infer'], {
        messages: [{ role: 'user', content: 'test' }],
      });

      assert.isNull(err);
      assert.equal(result.code, 30801);
      assert.equal(result.message, 'LLM engine not enabled');
      assert.isNull(result.result);
    });

    it('should return error 30801 when llmEngine is null', async () => {
      const node = { llmEngine: null };
      const apis = getLlmApis(node);

      const { err, result } = await callApi(apis['ain_llm_infer'], {
        messages: [{ role: 'user', content: 'test' }],
      });

      assert.isNull(err);
      assert.equal(result.code, 30801);
    });

    it('should return error 30802 when inference fails', async () => {
      const node = createMockNode({
        infer: () => Promise.reject(new Error('vLLM timeout')),
      });
      const apis = getLlmApis(node);

      const { err, result } = await callApi(apis['ain_llm_infer'], {
        messages: [{ role: 'user', content: 'test' }],
      });

      assert.isNull(err);
      assert.equal(result.code, 30802);
      assert.include(result.message, 'vLLM timeout');
      assert.isNull(result.result);
    });

    it('should include protoVer in response', async () => {
      const node = createMockNode();
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_infer'], {
        messages: [{ role: 'user', content: 'test' }],
      });

      assert.isDefined(result.protoVer);
    });
  });

  // ---------------------------------------------------------------------------
  // ain_llm_explore
  // ---------------------------------------------------------------------------

  describe('ain_llm_explore', () => {
    it('should call llmEngine.explore with mapped params', async () => {
      let capturedArgs = null;
      const node = createMockNode({
        explore: (args) => {
          capturedArgs = args;
          return Promise.resolve({ title: 'Mapped', content: 'C', summary: 'S', depth: 2, tags: 'test' });
        },
      });
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_explore'], {
        topic_path: 'ai/transformers',
        context: 'Some context',
        frontier: { explorer_count: 3 },
      });

      assert.isObject(result.result);
      assert.equal(result.result.title, 'Mapped');
      assert.equal(capturedArgs.topicPath, 'ai/transformers');
      assert.equal(capturedArgs.context, 'Some context');
      assert.deepEqual(capturedArgs.frontier, { explorer_count: 3 });
    });

    it('should return 30801 when engine not enabled', async () => {
      const node = { llmEngine: null };
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_explore'], { topic_path: 'test' });
      assert.equal(result.code, 30801);
    });

    it('should return 30802 on explore error', async () => {
      const node = createMockNode({
        explore: () => Promise.reject(new Error('Parse error')),
      });
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_explore'], { topic_path: 'test' });
      assert.equal(result.code, 30802);
      assert.include(result.message, 'Parse error');
    });
  });

  // ---------------------------------------------------------------------------
  // ain_llm_generateCourse
  // ---------------------------------------------------------------------------

  describe('ain_llm_generateCourse', () => {
    it('should call llmEngine.generateCourse with mapped params', async () => {
      let capturedArgs = null;
      const explorations = [
        { title: 'E1', summary: 'S1', depth: 1 },
        { title: 'E2', summary: 'S2', depth: 2 },
      ];

      const node = createMockNode({
        generateCourse: (args) => {
          capturedArgs = args;
          return Promise.resolve({ stages: [{ title: 'S1', content: 'C1', exercise: 'E1' }] });
        },
      });
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_generateCourse'], {
        topic_path: 'ai/transformers',
        explorations,
      });

      assert.isObject(result.result);
      assert.isArray(result.result.stages);
      assert.equal(result.result.stages.length, 1);
      assert.equal(capturedArgs.topicPath, 'ai/transformers');
      assert.deepEqual(capturedArgs.explorations, explorations);
    });

    it('should return 30801 when engine not enabled', async () => {
      const node = { llmEngine: null };
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_generateCourse'], {
        topic_path: 'test',
        explorations: [],
      });

      assert.equal(result.code, 30801);
    });

    it('should return 30802 on generateCourse error', async () => {
      const node = createMockNode({
        generateCourse: () => Promise.reject(new Error('Generation failed')),
      });
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_generateCourse'], {
        topic_path: 'test',
        explorations: [],
      });

      assert.equal(result.code, 30802);
      assert.include(result.message, 'Generation failed');
    });
  });

  // ---------------------------------------------------------------------------
  // ain_llm_analyze
  // ---------------------------------------------------------------------------

  describe('ain_llm_analyze', () => {
    it('should call llmEngine.analyze with mapped params', async () => {
      let capturedArgs = null;
      const contextNodes = [
        { title: 'Node1', topic_path: 'ai/transformers', depth: 1, summary: 'Summary' },
      ];

      const node = createMockNode({
        analyze: (args) => {
          capturedArgs = args;
          return Promise.resolve('Analysis result');
        },
      });
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_analyze'], {
        question: 'How do transformers work?',
        context_nodes: contextNodes,
      });

      assert.equal(result.result, 'Analysis result');
      assert.equal(capturedArgs.question, 'How do transformers work?');
      assert.deepEqual(capturedArgs.contextNodes, contextNodes);
    });

    it('should return 30801 when engine not enabled', async () => {
      const node = { llmEngine: null };
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_analyze'], {
        question: 'test',
        context_nodes: [],
      });

      assert.equal(result.code, 30801);
    });

    it('should return 30802 on analyze error', async () => {
      const node = createMockNode({
        analyze: () => Promise.reject(new Error('Context too large')),
      });
      const apis = getLlmApis(node);

      const { result } = await callApi(apis['ain_llm_analyze'], {
        question: 'test',
        context_nodes: [],
      });

      assert.equal(result.code, 30802);
      assert.include(result.message, 'Context too large');
    });
  });

  // ---------------------------------------------------------------------------
  // Handler registration
  // ---------------------------------------------------------------------------

  describe('getLlmApis', () => {
    it('should return all four API handlers', () => {
      const node = createMockNode();
      const apis = getLlmApis(node);

      assert.isFunction(apis['ain_llm_infer']);
      assert.isFunction(apis['ain_llm_explore']);
      assert.isFunction(apis['ain_llm_generateCourse']);
      assert.isFunction(apis['ain_llm_analyze']);
      assert.equal(Object.keys(apis).length, 4);
    });
  });
});
