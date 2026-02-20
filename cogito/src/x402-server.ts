/**
 * x402 Content Server.
 * Serves enriched content with x402 payment gating.
 * Generalized from the domain-specific version in papers-with-claudecode.
 */

import { createServer as createHttpServer } from 'http';
import { AinClient } from './ain-client.js';
import { RecipeWatcher } from './recipe-watcher.js';
import { ContentListing } from './types.js';

type Handler = (req: any, res: any) => void | Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

function createApp() {
  const routes: Route[] = [];

  const app = {
    get(path: string, handler: Handler) { routes.push({ method: 'GET', path, handler }); },
    post(path: string, handler: Handler) { routes.push({ method: 'POST', path, handler }); },
    listen(port: number, cb?: () => void) {
      const server = createHttpServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        const url = new URL(req.url || '/', `http://localhost:${port}`);
        const method = req.method || 'GET';

        for (const route of routes) {
          if (route.method !== method) continue;
          const match = matchRoute(route.path, url.pathname);
          if (match) {
            (req as any).params = match;
            (req as any).query = Object.fromEntries(url.searchParams);
            const json = (data: any, status = 200) => {
              res.writeHead(status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            };
            (res as any).json = json;
            (res as any).status = (code: number) => ({ json: (data: any) => json(data, code) });

            try {
              await route.handler(req, res);
            } catch (err: any) {
              console.error(`[Server] Error: ${err.message}`);
              json({ error: 'Internal server error' }, 500);
            }
            return;
          }
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      server.listen(port, cb);
      return server;
    },
  };

  return app;
}

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  }).replace(/\*/g, '(.*)');

  const regex = new RegExp(`^${regexStr}$`);
  const match = pathname.match(regex);
  if (!match) return null;

  const params: Record<string, string> = {};
  paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
  return params;
}

/**
 * Create the x402 content server.
 */
export function createServer(ain: AinClient, watcher: RecipeWatcher) {
  const app = createApp();

  app.get('/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      address: ain.getAddress(),
      recipes: watcher.getRecipes().map(r => r.name),
    });
  });

  // List all available content
  app.get('/content', async (_req: any, res: any) => {
    try {
      const explorations = await ain.getAllExplorations();
      const listings: ContentListing[] = [];

      if (explorations) {
        for (const [topicKey, entries] of Object.entries(explorations)) {
          if (!entries || typeof entries !== 'object') continue;
          for (const [entryId, entry] of Object.entries(entries as Record<string, any>)) {
            const tags = (entry.tags || '').split(',').map((t: string) => t.trim());
            listings.push({
              id: `${topicKey}/${entryId}`,
              title: entry.title || 'Untitled',
              summary: entry.summary || '',
              tags,
              price: entry.price || '0',
              created_at: entry.created_at || 0,
            });
          }
        }
      }

      listings.sort((a, b) => b.created_at - a.created_at);
      res.json({ count: listings.length, listings });
    } catch (err: any) {
      (res as any).status(500).json({ error: err.message });
    }
  });

  // Get specific content — returns 402 if gated
  app.get('/content/:topicKey/:entryId', async (req: any, res: any) => {
    try {
      const topicPath = req.params.topicKey.replace(/_/g, '/');
      const explorations = await ain.getExplorations(topicPath);

      if (!explorations || !explorations[req.params.entryId]) {
        (res as any).status(404).json({ error: 'Content not found' });
        return;
      }

      const entry = explorations[req.params.entryId];
      const price = entry.price;

      if (price && parseFloat(price) > 0) {
        res.json({
          status: 402,
          title: entry.title,
          summary: entry.summary,
          tags: (entry.tags || '').split(','),
          price,
          currency: 'USDC',
          chain: 'base',
          payTo: ain.getAddress(),
          message: 'Payment required. Send USDC to payTo address on Base chain.',
        }, 402);
        return;
      }

      res.json({
        title: entry.title,
        summary: entry.summary,
        content: entry.content,
        tags: (entry.tags || '').split(','),
        depth: entry.depth,
        created_at: entry.created_at,
      });
    } catch (err: any) {
      (res as any).status(500).json({ error: err.message });
    }
  });

  // List active recipes
  app.get('/recipes', (_req: any, res: any) => {
    const recipes = watcher.getRecipes().map(r => ({
      name: r.name,
      version: r.version,
      watchTags: r.watch.tags,
      outputTags: r.output.tags,
      price: r.output.price,
    }));
    res.json({ count: recipes.length, recipes });
  });

  // Knowledge graph stats
  app.get('/stats', async (_req: any, res: any) => {
    try {
      const frontier = await ain.getFrontierMap();
      const graph = await ain.getGraph();
      res.json({
        address: ain.getAddress(),
        recipes: watcher.getRecipes().length,
        topics: frontier.length,
        graphNodes: Object.keys(graph.nodes || {}).length,
        graphEdges: Object.keys(graph.edges || {}).length,
        frontier,
      });
    } catch (err: any) {
      (res as any).status(500).json({ error: err.message });
    }
  });

  return app;
}
