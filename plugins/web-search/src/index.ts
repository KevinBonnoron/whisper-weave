import type { PluginBase, PluginMetadata, ToolsCapability, ToolWithHandler } from '@whisper-weave/plugin-sdk';

export interface WebSearchConfig {
  apiKey?: string;
  maxResults?: number;
}

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

interface SearchResult {
  results: SearchResultItem[];
  query: string;
  engine: 'brave' | 'duckduckgo';
  error?: string;
}

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

export default class implements PluginBase, ToolsCapability {
  public readonly metadata: PluginMetadata = {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web using Brave Search API or DuckDuckGo',
    version: '1.1.0',
  };

  private readonly useBrave: boolean;
  private readonly maxResults: number;

  public constructor(private readonly config: WebSearchConfig) {
    this.useBrave = Boolean(config.apiKey?.trim());
    this.maxResults = Math.min(Math.max(config.maxResults ?? 5, 1), 10);
  }

  public async shutdown(): Promise<void> {}

  public getTools(): ToolWithHandler[] {
    return [
      {
        name: 'web_search',
        description: 'Search the web for information. Returns titles, URLs and snippets from search results.',
        parameters: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'numResults', type: 'number', description: 'Number of results (1-10, default 5)', required: false },
        ],
        requiresApproval: false,
        handler: async (input) => {
          const query = String(input.query ?? '').trim();
          if (!query) {
            return { results: [], error: 'Query is required' };
          }

          const numResults = Math.min(Math.max(Number(input.numResults) || this.maxResults, 1), 10);

          if (this.useBrave) {
            const result = await this.searchBrave(query, numResults);
            if (result.error && result.results.length === 0) {
              return this.searchDuckDuckGo(query, numResults);
            }
            return result;
          }
          return this.searchDuckDuckGo(query, numResults);
        },
      },
    ];
  }

  private async searchBrave(query: string, count: number): Promise<SearchResult> {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.config.apiKey ?? '',
        },
      });

      if (!response.ok) {
        return {
          results: [],
          query,
          engine: 'brave',
          error: `Brave Search API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as BraveSearchResponse;
      const results: SearchResultItem[] =
        data.web?.results?.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.description,
        })) ?? [];

      return {
        results,
        query,
        engine: 'brave',
      };
    } catch (err) {
      return {
        results: [],
        query,
        engine: 'brave',
        error: `Brave Search failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async searchDuckDuckGo(query: string, count: number): Promise<SearchResult> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        return {
          results: [],
          query,
          engine: 'duckduckgo',
          error: `DuckDuckGo error: ${response.status}`,
        };
      }

      const html = await response.text();
      const results = this.parseDuckDuckGoHTML(html, count);

      return {
        results,
        query,
        engine: 'duckduckgo',
      };
    } catch (err) {
      return {
        results: [],
        query,
        engine: 'duckduckgo',
        error: `DuckDuckGo search failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private parseDuckDuckGoHTML(html: string, count: number): SearchResultItem[] {
    const results: SearchResultItem[] = [];

    const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

    const urlMatches = [...html.matchAll(resultPattern)];
    const snippetMatches = [...html.matchAll(snippetPattern)];

    for (let i = 0; i < Math.min(urlMatches.length, count); i++) {
      const urlMatch = urlMatches[i];
      if (!urlMatch) {
        continue;
      }

      let href = urlMatch[1] ?? '';
      const titleRaw = urlMatch[2] ?? '';
      const title = this.stripHtmlTags(titleRaw);

      if (href.includes('uddg=')) {
        const uddgMatch = href.match(/uddg=([^&]+)/);
        if (uddgMatch?.[1]) {
          href = decodeURIComponent(uddgMatch[1]);
        }
      }

      const snippetMatch = snippetMatches[i];
      const snippet = snippetMatch?.[1] ? this.stripHtmlTags(snippetMatch[1]) : '';

      if (!href.startsWith('http')) {
        continue;
      }

      results.push({
        title: title.trim() || 'No title',
        url: href,
        snippet: snippet.trim(),
      });
    }

    return results;
  }

  private stripHtmlTags(str: string): string {
    return str
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
