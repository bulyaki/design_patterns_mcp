import { describe, expect, it, vi } from 'vitest';
import { createDesignPatternsServer, type MCPServerConfig } from '../../src/mcp-server.js';

type TestServerInternals = {
  db: {
    query: ReturnType<typeof vi.fn>;
  };
  semanticSearch: {
    search: ReturnType<typeof vi.fn>;
  };
  handleSearchPatterns(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }>;
};

describe('mcp-server search_patterns', () => {
  function createTestServer(): TestServerInternals {
    const config: MCPServerConfig = {
      databasePath: './data/design-patterns.db',
      logLevel: 'info',
      enableLLM: false,
      maxConcurrentRequests: 10,
    };

    const server = createDesignPatternsServer(config) as unknown as TestServerInternals;
    server.db = {
      query: vi.fn(),
    };
    server.semanticSearch = {
      search: vi.fn(),
    };

    return server;
  }

  it('uses keyword strategy for legacy search_type requests', async () => {
    const server = createTestServer();
    server.db.query.mockReturnValue([
      {
        id: 'builder',
        name: 'Builder',
        category: 'Creational',
        description: 'Builds complex objects step by step',
        complexity: 'Intermediate',
        tags: '["creational"]',
      },
    ]);

    const response = await server.handleSearchPatterns({
      query: 'builder',
      search_type: 'keyword',
      limit: 5,
    });

    expect(server.db.query).toHaveBeenCalledOnce();
    expect(server.semanticSearch.search).not.toHaveBeenCalled();
    expect(response.content[0]?.text).toContain('strategy: keyword');
    expect(response.content[0]?.text).toContain('Builder');
  });

  it('falls back to keyword strategy when hybrid semantic search fails', async () => {
    const server = createTestServer();
    server.db.query.mockReturnValue([
      {
        id: 'builder',
        name: 'Builder',
        category: 'Creational',
        description: 'Builds complex objects step by step',
        complexity: 'Intermediate',
        tags: '["creational"]',
      },
    ]);
    server.semanticSearch.search.mockRejectedValue(new Error('vectors unavailable'));

    const response = await server.handleSearchPatterns({
      query: 'builder',
      searchType: 'hybrid',
      limit: 5,
    });

    expect(server.semanticSearch.search).toHaveBeenCalledOnce();
    expect(server.db.query).toHaveBeenCalledOnce();
    expect(response.content[0]?.text).toContain('strategy: keyword');
    expect(response.content[0]?.text).toContain('falling back to keyword search');
  });
});
