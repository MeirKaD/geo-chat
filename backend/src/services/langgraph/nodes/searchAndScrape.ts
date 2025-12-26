/**
 * Node 3: Parallel Search & Scrape
 *
 * This node executes searches and scrapes results in parallel for maximum performance.
 * Uses MCP Bright Data for both search and scraping operations.
 *
 * Key improvements over old sequential approach:
 * - Parallel execution (5-10x faster)
 * - URL deduplication
 * - Graceful error handling with Promise.allSettled
 */

import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { ScrapedPage, SearchResult } from '../../../types/pipeline.js';
import { loadToolBundle, resetToolBundle } from '../../mcp/tools.js';

/**
 * Execute a single search query using MCP with retry on session expiry
 */
async function executeSearch(query: string, isRetry: boolean = false): Promise<SearchResult[]> {
  try {
    console.log(`[Search] Executing search for: "${query}"${isRetry ? ' (retry)' : ''}`);

    // Get tool bundle (uses global cache in tools.ts)
    const toolBundle = await loadToolBundle();
    const searchTool = toolBundle.mcpTools.find(
      (tool) => tool.name === 'brightdata__search_engine'
    );

    if (!searchTool) {
      console.warn('[Search] Bright Data search tool not found');
      return [];
    }

    // Invoke the search tool (only pass query, not num_results)
    const result = await searchTool.invoke({
      query,
    });

    // Parse the result
    let parsedResult: any;
    if (typeof result === 'string') {
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { results: [] };
      }
    } else {
      parsedResult = result;
    }

    // Extract search results from the "organic" array (Google search format)
    const results: SearchResult[] = [];

    if (Array.isArray(parsedResult.organic)) {
      for (let i = 0; i < parsedResult.organic.length; i++) {
        const item = parsedResult.organic[i];
        results.push({
          title: item.title || '',
          url: item.link || '',
          snippet: item.description || '',
          position: i + 1,
        });
      }
    }

    console.log(`[Search] Found ${results.length} results for: "${query}"`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If session expired and this is not already a retry, reset and retry once
    if (!isRetry && (errorMessage.includes('Session not found') || errorMessage.includes('session'))) {
      console.log('[Search] Session expired, reconnecting and retrying...');
      resetToolBundle();
      return executeSearch(query, true);
    }

    console.error(`[Search] Error searching for "${query}":`, error);
    return [];
  }
}

/**
 * Scrape a single URL using MCP with retry on session expiry
 */
async function scrapePage(url: string, isRetry: boolean = false): Promise<ScrapedPage> {
  try {
    console.log(`[Scrape] Scraping: ${url}${isRetry ? ' (retry)' : ''}`);

    // Get tool bundle (uses global cache in tools.ts)
    const toolBundle = await loadToolBundle();
    const scrapeTool = toolBundle.mcpTools.find(
      (tool) => tool.name === 'brightdata__scrape_as_markdown'
    );

    if (!scrapeTool) {
      console.warn('[Scrape] Bright Data scrape tool not found');
      return {
        url,
        markdown: '',
        scrapedAt: new Date(),
        success: false,
        error: 'Scrape tool not available',
      };
    }

    // Invoke the scrape tool
    const result = await scrapeTool.invoke({ url });

    // The result should be markdown content
    const markdown = typeof result === 'string' ? result : JSON.stringify(result);

    console.log(`[Scrape] Successfully scraped ${url} (${markdown.length} chars)`);

    return {
      url,
      markdown,
      scrapedAt: new Date(),
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If session expired and this is not already a retry, reset and retry once
    if (!isRetry && (errorMessage.includes('Session not found') || errorMessage.includes('session'))) {
      console.log('[Scrape] Session expired, reconnecting and retrying...');
      resetToolBundle();
      return scrapePage(url, true);
    }

    console.error(`[Scrape] Error scraping ${url}:`, error);

    return {
      url,
      markdown: '',
      scrapedAt: new Date(),
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Deduplicate URLs (remove duplicates and invalid URLs)
 */
function deduplicateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const deduplicated: string[] = [];

  for (const url of urls) {
    // Normalize URL
    const normalized = url.trim().toLowerCase();

    // Skip invalid URLs
    if (!normalized || !normalized.startsWith('http')) {
      continue;
    }

    // Skip duplicates
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduplicated.push(url); // Keep original case
  }

  return deduplicated;
}

/**
 * Node function: Parallel Search & Scrape
 */
export async function searchAndScrape(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Node 3: Search & Scrape] Starting...');
  console.log('Queries:', state.generatedQueries?.queries);

  try {
    // Check if we have generated queries
    if (!state.generatedQueries || state.generatedQueries.queries.length === 0) {
      console.warn('[Node 3: Search & Scrape] No queries to search');

      return {
        ...createProgressUpdate('search_and_scrape', 48),
        searchResults: [],
        scrapedContent: [],
      };
    }

    const { queries, maxResults } = state.generatedQueries;

    // ===== STEP 1: Parallel Search =====
    console.log(`[Node 3: Search & Scrape] Executing ${queries.length} searches in parallel...`);

    const searchPromises = queries.map((query) => executeSearch(query));
    const searchResultsArrays = await Promise.all(searchPromises);

    // Flatten and deduplicate results
    const allSearchResults = searchResultsArrays.flat();
    console.log(`[Node 3: Search & Scrape] Total search results: ${allSearchResults.length}`);

    // ===== STEP 2: Extract URLs =====
    // Get top N URLs from search results
    const urls = allSearchResults
      .slice(0, maxResults || 12) // Limit total URLs
      .map((result) => result.url)
      .filter(Boolean);

    const uniqueUrls = deduplicateUrls(urls);
    console.log(`[Node 3: Search & Scrape] URLs to scrape: ${uniqueUrls.length} (after deduplication)`);

    if (uniqueUrls.length === 0) {
      console.warn('[Node 3: Search & Scrape] No URLs to scrape');

      return {
        ...createProgressUpdate('search_and_scrape', 48),
        searchResults: allSearchResults,
        scrapedContent: [],
      };
    }

    // ===== STEP 3: Parallel Scraping =====
    console.log(`[Node 3: Search & Scrape] Scraping ${uniqueUrls.length} URLs in parallel...`);

    const scrapePromises = uniqueUrls.map((url) => scrapePage(url));

    // Use Promise.allSettled to handle failures gracefully
    const scrapeResults = await Promise.allSettled(scrapePromises);

    // Filter successful scrapes
    const scrapedContent: ScrapedPage[] = scrapeResults
      .filter((result): result is PromiseFulfilledResult<ScrapedPage> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((page) => page.success && page.markdown.length > 0);

    console.log(`[Node 3: Search & Scrape] Successfully scraped ${scrapedContent.length}/${uniqueUrls.length} pages`);

    // Log failures for debugging
    const failures = scrapeResults.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[Node 3: Search & Scrape] ${failures.length} scraping failures`);
    }

    return {
      ...createProgressUpdate('search_and_scrape', 48),
      searchResults: allSearchResults,
      scrapedContent,
    };
  } catch (error) {
    console.error('[Node 3: Search & Scrape] Error:', error);

    // On error, return empty results
    return {
      ...createProgressUpdate('search_and_scrape', 48),
      searchResults: [],
      scrapedContent: [],
      errors: [
        {
          node: 'search_and_scrape',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
