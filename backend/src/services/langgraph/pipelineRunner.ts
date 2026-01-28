

import { RunnableConfig } from '@langchain/core/runnables';
import { getPipelineGraph } from './pipelineGraph.js';
import { PipelineState, createInitialState } from './pipelineState.js';
import { PipelineResult, ConversationMessage } from '../../types/pipeline.js';

/**
 * Input for running the pipeline
 */
export interface RunPipelineInput {
  /** Thread ID for conversation history */
  threadId: string;
  /** User's message */
  userMessage: string;
  /** Full conversation history (previous messages, excluding current) */
  messages: ConversationMessage[];
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
  const { threadId, userMessage, messages } = input;

  console.log(`[Pipeline Runner] Starting pipeline for thread: ${threadId}`);
  console.log(`[Pipeline Runner] User message: "${userMessage}"`);
  console.log(`[Pipeline Runner] Conversation history: ${messages.length} previous messages`);

  // Get the compiled graph (cached after first call)
  const graph = getPipelineGraph();

  // Build conversation context from messages (exclude current message)
  const previousMessages = messages.slice(0, -1);

  // Configure with thread-based checkpointing
  const config: RunnableConfig = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Retrieve previous state from checkpoint to get previousIntent
  let previousIntent = null;
  try {
    const checkpointState = await graph.getState(config);
    if (checkpointState?.values?.conversationHistory?.previousIntent) {
      previousIntent = checkpointState.values.conversationHistory.previousIntent;
      console.log(`[Pipeline Runner] Retrieved previous intent from checkpoint`);
    }
  } catch {
    // No checkpoint exists yet, which is fine for first message
  }

  // Prepare initial state with:
  // - Fresh accumulating channels (markers, places, results) to avoid cross-turn accumulation
  // - Preserved previousIntent from checkpoint for context continuity
  const initialState: Partial<PipelineState> = {
    userMessage,
    threadId,
    conversationHistory: {
      messages: previousMessages,
      previousIntent,
    },
    // Reset accumulating channels to empty arrays for this turn
    searchResults: [],
    scrapedContent: [],
    extractedPlaces: [],
    markers: [],
    polygons: [],
    errors: [],
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
  const { threadId, userMessage, messages } = input;

  console.log(`[Pipeline Runner Stream] Starting pipeline for thread: ${threadId}`);
  console.log(`[Pipeline Runner Stream] Conversation history: ${messages.length} previous messages`);

  const graph = getPipelineGraph();

  // Build conversation context from messages (exclude current message)
  const previousMessages = messages.slice(0, -1);

  const config: RunnableConfig = {
    configurable: {
      thread_id: threadId,
    },
  };

  // Retrieve previous state from checkpoint to get previousIntent
  let previousIntent = null;
  try {
    const checkpointState = await graph.getState(config);
    if (checkpointState?.values?.conversationHistory?.previousIntent) {
      previousIntent = checkpointState.values.conversationHistory.previousIntent;
      console.log(`[Pipeline Runner Stream] Retrieved previous intent from checkpoint`);
    }
  } catch {
    // No checkpoint exists yet, which is fine for first message
  }

  // Prepare initial state with:
  // - Fresh accumulating channels (markers, places, results) to avoid cross-turn accumulation
  // - Preserved previousIntent from checkpoint for context continuity
  const initialState: Partial<PipelineState> = {
    userMessage,
    threadId,
    conversationHistory: {
      messages: previousMessages,
      previousIntent,
    },
    // Reset accumulating channels to empty arrays for this turn
    searchResults: [],
    scrapedContent: [],
    extractedPlaces: [],
    markers: [],
    polygons: [],
    errors: [],
  };

  console.log('[Pipeline Runner Stream] Starting graph stream...');
  const startTime = Date.now();

  let finalState: PipelineState = { ...createInitialState(userMessage, threadId, { messages: previousMessages, previousIntent: null }) } as PipelineState;
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
