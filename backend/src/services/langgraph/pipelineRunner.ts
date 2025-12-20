/**
 * Pipeline Runner
 *
 * This file provides the main entry point for running the pipeline architecture.
 * It handles:
 * - Initializing the pipeline graph
 * - Preparing initial state from user message
 * - Invoking the graph with thread-based checkpointing
 * - Extracting and formatting the final result
 */

import { RunnableConfig } from '@langchain/core/runnables';
import { getPipelineGraph } from './pipelineGraph.js';
import { PipelineState } from './pipelineState.js';
import { PipelineResult } from '../../types/pipeline.js';

/**
 * Input for running the pipeline
 */
export interface RunPipelineInput {
  /** Thread ID for conversation history */
  threadId: string;
  /** User's message */
  userMessage: string;
}

/**
 * Run the pipeline agent end-to-end
 *
 * This function:
 * 1. Gets the compiled pipeline graph (lazy-loaded and cached)
 * 2. Prepares initial state with the user's message
 * 3. Invokes the graph with thread-based checkpointing
 * 4. Extracts the final state and formats the result
 *
 * @param input - User message and thread ID
 * @returns Pipeline result with final message, markers, and metadata
 */
export async function runPipelineAgent(input: RunPipelineInput): Promise<PipelineResult> {
  const { threadId, userMessage } = input;

  console.log(`[Pipeline Runner] Starting pipeline for thread: ${threadId}`);
  console.log(`[Pipeline Runner] User message: "${userMessage}"`);

  // Get the compiled graph (cached after first call)
  const graph = getPipelineGraph();

  // Prepare initial state
  const initialState: Partial<PipelineState> = {
    userMessage,
    threadId,
  };

  // Configure with thread-based checkpointing
  const config: RunnableConfig = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Invoke the graph
  console.log('[Pipeline Runner] Invoking graph...');
  const startTime = Date.now();

  const finalState = await graph.invoke(initialState, config);

  const duration = Date.now() - startTime;
  console.log(`[Pipeline Runner] Graph execution completed in ${duration}ms`);

  // Extract results from final state
  const {
    finalMessage,
    markers,
    polygons,
    errors,
  } = finalState;

  console.log(`[Pipeline Runner] Results:`);
  console.log(`  - Message: "${finalMessage}"`);
  console.log(`  - Markers: ${markers.length}`);
  console.log(`  - Polygons: ${polygons.length}`);
  console.log(`  - Errors: ${errors.length}`);

  // Log errors if any
  if (errors.length > 0) {
    console.warn('[Pipeline Runner] Errors encountered:');
    errors.forEach((error) => {
      console.warn(`  - [${error.node}] ${error.error}`);
    });
  }

  // Format result
  const result: PipelineResult = {
    message: finalMessage || 'No results found.',
    markers,
    polygons,
    threadId,
    errors: errors.length > 0
      ? errors.map((e) => ({
          node: e.node,
          error: e.error,
        }))
      : undefined,
    metadata: {
      executionTime: duration,
      nodesExecuted: [
        'extract_intent',
        'generate_queries',
        'search_and_scrape',
        'extract_places',
        'geocode_stream',
        'summarize',
      ],
    },
  };

  return result;
}

/**
 * Run the pipeline agent with streaming (Phase 4)
 *
 * This will be implemented in Phase 4 to support progressive updates.
 * For now, it's a placeholder that calls the non-streaming version.
 *
 * @param input - User message and thread ID
 * @returns Pipeline result
 */
export async function runPipelineAgentStream(input: RunPipelineInput): Promise<PipelineResult> {
  // TODO: Implement streaming in Phase 4 (Task 4.3)
  // For now, just call the non-streaming version
  console.log('[Pipeline Runner] Streaming not yet implemented, using non-streaming version');
  return runPipelineAgent(input);
}
