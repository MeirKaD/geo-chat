

import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { SearchResult } from '../../../types/pipeline.js';
import { loadToolBundleWithRetry, resetToolBundle } from '../../mcp/tools.js';

const MAX_FAST_RESULTS = 10;

/**
 * Execute a single search query using MCP with retry on session expiry
 */
async function executeSearch(query: string, isRetry: boolean = false): Promise<SearchResult[]> {
  try {
    console.log(`[Fast Search] Executing search for: "${query}"${isRetry ? ' (retry)' : ''}`);

    // Get tool bundle (will use cached version if available, retries on connection errors)
    const toolBundle = await loadToolBundleWithRetry();
    const searchTool = toolBundle.mcpTools.find(
      (tool) => tool.name === 'brightdata__search_engine'
    );

    if (!searchTool) {
      console.warn('[Fast Search] Bright Data search tool not found');
      return [];
    }

    const result = await searchTool.invoke({ query });

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

    const results: SearchResult[] = [];

    if (Array.isArray(parsedResult.organic)) {
      for (let i = 0; i < Math.min(parsedResult.organic.length, MAX_FAST_RESULTS); i++) {
        const item = parsedResult.organic[i];
        results.push({
          title: item.title || '',
          url: item.link || '',
          snippet: item.description || '',
          position: i + 1,
        });
      }
    }

    console.log(`[Fast Search] Found ${results.length} results for: "${query}"`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if this is a recoverable error (session/connection issues)
    const isRecoverable =
      errorMessage.includes('Session not found') ||
      errorMessage.includes('session') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('Failed to connect');

    // If recoverable and this is not already a retry, reset and retry once
    if (!isRetry && isRecoverable) {
      console.log(`[Fast Search] Connection error, reconnecting and retrying: ${errorMessage}`);
      resetToolBundle();
      return executeSearch(query, true);
    }

    console.error(`[Fast Search] Error searching for "${query}":`, error);
    return [];
  }
}

/**
 * Fast Search Node Function
 *
 * Executes searches in parallel but limits results to 10 total.
 * Does NOT scrape pages - search snippets are used directly.
 */
export async function fastSearch(state: PipelineState): Promise<PipelineStateUpdate> {
  console.log('[Fast Search] Starting...');
  console.log('Queries:', state.generatedQueries?.queries);

  try {
    if (!state.generatedQueries || state.generatedQueries.queries.length === 0) {
      console.warn('[Fast Search] No queries to search');
      return {
        ...createProgressUpdate('fast_search', 40),
        searchResults: [],
      };
    }

    const { queries } = state.generatedQueries;

    // Execute searches in parallel
    console.log(`[Fast Search] Executing ${queries.length} searches in parallel...`);
    const searchPromises = queries.map((query) => executeSearch(query));
    const searchResultsArrays = await Promise.all(searchPromises);

    // Flatten results
    const allSearchResults = searchResultsArrays.flat();
    console.log(`[Fast Search] Total search results: ${allSearchResults.length}`);

    // Deduplicate by URL and limit to MAX_FAST_RESULTS
    const seenUrls = new Set<string>();
    const uniqueResults: SearchResult[] = [];

    for (const result of allSearchResults) {
      const normalizedUrl = result.url.trim().toLowerCase();
      if (!seenUrls.has(normalizedUrl) && result.url.startsWith('http')) {
        seenUrls.add(normalizedUrl);
        uniqueResults.push(result);
        if (uniqueResults.length >= MAX_FAST_RESULTS) break;
      }
    }

    console.log(`[Fast Search] Unique results (limited to ${MAX_FAST_RESULTS}): ${uniqueResults.length}`);

    return {
      ...createProgressUpdate('fast_search', 40),
      searchResults: uniqueResults,
      // No scrapedContent - we skip scraping in fast mode
    };
  } catch (error) {
    console.error('[Fast Search] Error:', error);

    return {
      ...createProgressUpdate('fast_search', 40),
      searchResults: [],
      errors: [
        {
          node: 'fast_search',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        },
      ],
    };
  }
}
