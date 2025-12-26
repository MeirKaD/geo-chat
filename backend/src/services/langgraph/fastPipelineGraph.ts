/**
 * Fast Track Pipeline Graph Definition
 *
 * This is a lightweight version of the main pipeline that prioritizes speed.
 * It skips scraping and address enrichment, extracting places directly from search results.
 *
 * Flow:
 * START → extract_intent → generate_queries → fast_search → fast_extract → geocode_stream → summarize → END
 *
 * Key differences from full pipeline:
 * - No scraping (uses search snippets directly)
 * - No address enrichment
 * - Limited to 10 results
 * - ~5-10x faster than full pipeline
 */

import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { PipelineStateAnnotation } from './pipelineState.js';

// Import shared node implementations
import { extractIntent } from './nodes/intentExtraction.js';
import { generateQueries } from './nodes/queryGeneration.js';
import { geocodeStream } from './nodes/geocoding.js';
import { summarize } from './nodes/summarization.js';

// Import fast-specific nodes
import { fastSearch } from './nodes/fastSearch.js';
import { fastExtract } from './nodes/fastExtract.js';

/**
 * Creates the fast pipeline graph
 */
function createFastPipelineGraphDefinition() {
  const workflow = new StateGraph(PipelineStateAnnotation)
    // Add nodes (6 nodes instead of 7 - no address_enrichment)
    .addNode('extract_intent', extractIntent)
    .addNode('generate_queries', generateQueries)
    .addNode('fast_search', fastSearch)
    .addNode('fast_extract', fastExtract)
    .addNode('geocode_stream', geocodeStream)
    .addNode('summarize', summarize)
    // Define linear flow
    .addEdge(START, 'extract_intent')
    .addEdge('extract_intent', 'generate_queries')
    .addEdge('generate_queries', 'fast_search')
    .addEdge('fast_search', 'fast_extract')
    .addEdge('fast_extract', 'geocode_stream')
    .addEdge('geocode_stream', 'summarize')
    .addEdge('summarize', END);

  return workflow;
}

// ===== Graph Compilation & Caching =====

let compiledFastGraph: ReturnType<ReturnType<typeof createFastPipelineGraphDefinition>['compile']> | null = null;

/**
 * Gets or creates the compiled fast pipeline graph
 */
export function getFastPipelineGraph() {
  if (!compiledFastGraph) {
    console.log('[Fast Pipeline Graph] Compiling graph for the first time...');

    const workflow = createFastPipelineGraphDefinition();

    compiledFastGraph = workflow.compile({
      checkpointer: new MemorySaver(),
    });

    console.log('[Fast Pipeline Graph] Compilation complete');
  }

  return compiledFastGraph;
}

/**
 * Helper to reset the graph (useful for testing)
 */
export function resetFastPipelineGraph() {
  compiledFastGraph = null;
  console.log('[Fast Pipeline Graph] Graph reset');
}
