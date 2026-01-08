

import { PipelineState, PipelineStateUpdate, createProgressUpdate } from '../pipelineState.js';
import { SearchResult } from '../../../types/pipeline.js';
import { executeNativeSearch } from '../../search/nativeSearch.js';

const MAX_FAST_RESULTS = 10;

/**
 * Execute a single search query using native Bright Data API with geo-location support
 */
async function executeSearch(query: string, countryCode?: string): Promise<SearchResult[]> {
  const results = await executeNativeSearch({
    query,
    countryCode,
    clientName: 'geo-chat-fast-search',
  });

  // Limit results for fast search
  return results.slice(0, MAX_FAST_RESULTS);
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

    const { queries, countryCode } = state.generatedQueries;

    // Execute searches in parallel
    console.log(`[Fast Search] Executing ${queries.length} searches in parallel...`);
    if (countryCode) {
      console.log(`[Fast Search] Using geo-location: ${countryCode}`);
    }
    const searchPromises = queries.map((query) => executeSearch(query, countryCode));
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
