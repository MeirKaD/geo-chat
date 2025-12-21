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
import { PipelineState, createInitialState } from './pipelineState.js';
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

const PIPELINE_NODE_NAMES = [
  'extract_intent',
  'generate_queries',
  'search_and_scrape',
  'extract_places',
  'address_enrichment',
  'geocode_stream',
  'summarize',
] as const;

type PipelineNodeName = (typeof PIPELINE_NODE_NAMES)[number];

function isPipelineNodeName(name: string): name is PipelineNodeName {
  return PIPELINE_NODE_NAMES.includes(name as PipelineNodeName);
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
        'address_enrichment',
        'geocode_stream',
        'summarize',
      ],
    },
  };

  return result;
}

/**
 * Run the pipeline agent with streaming progress updates
 *
 * @param input - User message and thread ID
 * @param onProgress - Callback for progress updates
 * @returns Pipeline result
 */
export async function runPipelineAgentStream(
  input: RunPipelineInput,
  onProgress?: (progress: { currentStep: string; percentComplete: number; message?: string }) => void
): Promise<PipelineResult> {
  const { threadId, userMessage } = input;

  console.log(`[Pipeline Runner Stream] Starting pipeline for thread: ${threadId}`);

  const graph = getPipelineGraph();

  const initialState: Partial<PipelineState> = {
    userMessage,
    threadId,
  };

  const config: RunnableConfig = {
    configurable: {
      thread_id: threadId,
    },
  };

  console.log('[Pipeline Runner Stream] Starting graph stream...');
  const startTime = Date.now();

  let finalState: PipelineState = { ...createInitialState(userMessage, threadId) } as PipelineState;
  let receivedState = false;

  // Stream through the graph execution
  for await (const event of await graph.stream(initialState, config)) {
    // event is { [nodeName]: state }
    const nodeNames = Object.keys(event);
    if (nodeNames.length === 0) continue;

    const nodeName = nodeNames.find(isPipelineNodeName);
    if (!nodeName) continue;

    const state = event[nodeName] as PipelineState | undefined;
    if (!state) continue;

    receivedState = true;
    finalState = { ...finalState, ...state };

    // Send progress update
    if (state.progress && onProgress) {
      onProgress({
        currentStep: state.progress.currentStep,
        percentComplete: state.progress.percentComplete,
        message: getProgressMessage(state.progress.currentStep, state),
      });
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[Pipeline Runner Stream] Graph execution completed in ${duration}ms`);

  if (!receivedState) {
    throw new Error('Pipeline execution failed - no final state received');
  }

  const {
    finalMessage,
    markers = [],
    polygons = [],
    errors = [],
  } = finalState;

  console.log(`[Pipeline Runner Stream] Results:`);
  console.log(`  - Message: "${finalMessage}"`);
  console.log(`  - Markers: ${markers.length}`);
  console.log(`  - Polygons: ${polygons.length}`);
  console.log(`  - Errors: ${errors.length}`);

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
        'address_enrichment',
        'geocode_stream',
        'summarize',
      ],
    },
  };

  return result;
}

/**
 * Get a human-readable progress message based on the current step
 */
function getProgressMessage(step: string, state: PipelineState): string {
  switch (step) {
    case 'intent_extraction':
      return 'Understanding your request...';
    case 'query_generation':
      return 'Generating search queries...';
    case 'search_scrape':
      return `Searching the web... (found ${state.searchResults?.length || 0} results)`;
    case 'data_extraction':
      return `Extracting place data... (${state.extractedPlaces?.length || 0} places found)`;
    case 'geocoding':
      return `Getting coordinates... (${state.markers?.length || 0} markers)`;
    case 'summarization':
      return 'Preparing your results...';
    default:
      return `Processing: ${step}`;
  }
}
