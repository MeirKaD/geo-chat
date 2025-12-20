/**
 * Pipeline Graph Definition
 *
 * This file defines the LangGraph workflow for the pipeline architecture.
 * It creates a graph with 6 specialized nodes instead of the agent-tool loop.
 *
 * Flow:
 * START → extract_intent → generate_queries → search_and_scrape →
 * extract_places → geocode_stream → summarize → END
 */

import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { PipelineStateAnnotation } from './pipelineState.js';

// Import node implementations
import { extractIntent } from './nodes/intentExtraction.js';
import { generateQueries } from './nodes/queryGeneration.js';
import { searchAndScrape } from './nodes/searchAndScrape.js';
import { extractPlaces } from './nodes/dataExtraction.js';
import { geocodeStream } from './nodes/geocoding.js';
import { summarize } from './nodes/summarization.js';

// ===== All Nodes Implemented =====
// Node 1 (extractIntent) - implemented in nodes/intentExtraction.ts
// Node 2 (generateQueries) - implemented in nodes/queryGeneration.js
// Node 3 (searchAndScrape) - implemented in nodes/searchAndScrape.ts
// Node 4 (extractPlaces) - implemented in nodes/dataExtraction.ts
// Node 5 (geocodeStream) - implemented in nodes/geocoding.ts
// Node 6 (summarize) - implemented in nodes/summarization.ts

// ===== Graph Definition =====

/**
 * Creates the pipeline graph
 *
 * This graph defines the workflow with 6 sequential nodes.
 * Each node performs a specific task and updates the state.
 */
function createPipelineGraphDefinition() {
  // Create workflow with our custom state annotation  // Use method chaining like in the existing graph.ts
  const workflow = new StateGraph(PipelineStateAnnotation)
    // Add all 6 nodes
    .addNode('extract_intent', extractIntent)
    .addNode('generate_queries', generateQueries)
    .addNode('search_and_scrape', searchAndScrape)
    .addNode('extract_places', extractPlaces)
    .addNode('geocode_stream', geocodeStream)
    .addNode('summarize', summarize)
    // Define linear flow: START → ... → END
    .addEdge(START, 'extract_intent')
    .addEdge('extract_intent', 'generate_queries')
    .addEdge('generate_queries', 'search_and_scrape')
    .addEdge('search_and_scrape', 'extract_places')
    .addEdge('extract_places', 'geocode_stream')
    .addEdge('geocode_stream', 'summarize')
    .addEdge('summarize', END);

  return workflow;
}

// ===== Graph Compilation & Caching =====

let compiledGraph: ReturnType<ReturnType<typeof createPipelineGraphDefinition>['compile']> | null = null;

/**
 * Gets or creates the compiled pipeline graph
 *
 * The graph is lazy-loaded and cached for performance.
 * Uses MemorySaver for checkpointing (thread-based conversation history).
 */
export function getPipelineGraph() {
  if (!compiledGraph) {
    console.log('[Pipeline Graph] Compiling graph for the first time...');

    const workflow = createPipelineGraphDefinition();

    // Compile with memory checkpointer for conversation history
    compiledGraph = workflow.compile({
      checkpointer: new MemorySaver(),
    });

    console.log('[Pipeline Graph] Compilation complete');
  }

  return compiledGraph;
}

/**
 * Helper to reset the graph (useful for testing)
 */
export function resetPipelineGraph() {
  compiledGraph = null;
  console.log('[Pipeline Graph] Graph reset');
}

// Export node functions for testing
export {
  extractIntent,
  generateQueries,
  searchAndScrape,
  extractPlaces,
  geocodeStream,
  summarize,
};
