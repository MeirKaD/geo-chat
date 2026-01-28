

import { RunnableConfig } from '@langchain/core/runnables';
import { getFastPipelineGraph } from './fastPipelineGraph.js';
import { PipelineState, createInitialState } from './pipelineState.js';
import { PipelineResult, ConversationMessage } from '../../types/pipeline.js';

/**
 * Input for running the fast pipeline
 */
export interface RunFastPipelineInput {
  threadId: string;
  userMessage: string;
  /** Full conversation history (previous messages, excluding current) */
  messages: ConversationMessage[];
}

const FAST_PIPELINE_NODE_NAMES = [
  'extract_intent',
  'generate_queries',
  'fast_search',
  'fast_extract',
  'geocode_stream',
  'summarize',
] as const;

type FastPipelineNodeName = (typeof FAST_PIPELINE_NODE_NAMES)[number];

function isFastPipelineNodeName(name: string): name is FastPipelineNodeName {
  return FAST_PIPELINE_NODE_NAMES.includes(name as FastPipelineNodeName);
}

/**
 * Run the fast pipeline agent (blocking)
 */
export async function runFastPipelineAgent(input: RunFastPipelineInput): Promise<PipelineResult> {
  const { threadId, userMessage, messages } = input;

  console.log(`[Fast Pipeline Runner] Starting fast pipeline for thread: ${threadId}`);
  console.log(`[Fast Pipeline Runner] User message: "${userMessage}"`);
  console.log(`[Fast Pipeline Runner] Conversation history: ${messages.length} previous messages`);

  const graph = getFastPipelineGraph();

  // Build conversation context from messages (exclude current message)
  const previousMessages = messages.slice(0, -1);

  const config: RunnableConfig = {
    configurable: {
      thread_id: `fast-${threadId}`, // Prefix to avoid conflicts with full pipeline
    },
  };

  // Retrieve previous state from checkpoint to get previousIntent
  let previousIntent = null;
  try {
    const checkpointState = await graph.getState(config);
    if (checkpointState?.values?.conversationHistory?.previousIntent) {
      previousIntent = checkpointState.values.conversationHistory.previousIntent;
      console.log(`[Fast Pipeline Runner] Retrieved previous intent from checkpoint`);
    }
  } catch {
    // No checkpoint exists yet, which is fine for first message
  }

  // Create initial state with:
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

  console.log('[Fast Pipeline Runner] Invoking graph...');
  const startTime = Date.now();

  const finalState = await graph.invoke(initialState, config);

  const duration = Date.now() - startTime;
  console.log(`[Fast Pipeline Runner] Completed in ${duration}ms`);

  const { finalMessage, markers, polygons, errors } = finalState;

  console.log(`[Fast Pipeline Runner] Results:`);
  console.log(`  - Message: "${finalMessage}"`);
  console.log(`  - Markers: ${markers.length}`);
  console.log(`  - Errors: ${errors.length}`);

  const result: PipelineResult = {
    message: finalMessage || 'No results found.',
    markers,
    polygons,
    threadId,
    errors: errors.length > 0
      ? errors.map((e) => ({ node: e.node, error: e.error }))
      : undefined,
    metadata: {
      executionTime: duration,
      nodesExecuted: [...FAST_PIPELINE_NODE_NAMES],
    },
  };

  return result;
}

/**
 * Run the fast pipeline agent with streaming progress updates
 */
export async function runFastPipelineAgentStream(
  input: RunFastPipelineInput,
  onProgress?: (progress: { currentStep: string; percentComplete: number; message?: string }) => void
): Promise<PipelineResult> {
  const { threadId, userMessage, messages } = input;

  console.log(`[Fast Pipeline Runner Stream] Starting for thread: ${threadId}`);
  console.log(`[Fast Pipeline Runner Stream] Conversation history: ${messages.length} previous messages`);

  const graph = getFastPipelineGraph();

  // Build conversation context from messages (exclude current message)
  const previousMessages = messages.slice(0, -1);

  const config: RunnableConfig = {
    configurable: {
      thread_id: `fast-${threadId}`,
    },
  };

  // Retrieve previous state from checkpoint to get previousIntent
  let previousIntent = null;
  try {
    const checkpointState = await graph.getState(config);
    if (checkpointState?.values?.conversationHistory?.previousIntent) {
      previousIntent = checkpointState.values.conversationHistory.previousIntent;
      console.log(`[Fast Pipeline Runner Stream] Retrieved previous intent from checkpoint`);
    }
  } catch {
    // No checkpoint exists yet, which is fine for first message
  }

  // Create initial state with:
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
    // This prevents data from previous turns bleeding into current results
    searchResults: [],
    scrapedContent: [],
    extractedPlaces: [],
    markers: [],
    polygons: [],
    errors: [],
  };

  console.log('[Fast Pipeline Runner Stream] Starting graph stream...');
  const startTime = Date.now();

  let finalState: PipelineState = { ...createInitialState(userMessage, threadId, { messages: previousMessages, previousIntent: null }) } as PipelineState;
  let receivedState = false;

  for await (const event of await graph.stream(initialState, config)) {
    const nodeNames = Object.keys(event);
    if (nodeNames.length === 0) continue;

    const nodeName = nodeNames.find(isFastPipelineNodeName);
    if (!nodeName) continue;

    const state = event[nodeName] as PipelineState | undefined;
    if (!state) continue;

    receivedState = true;
    finalState = { ...finalState, ...state };

    if (state.progress && onProgress) {
      onProgress({
        currentStep: state.progress.currentStep,
        percentComplete: state.progress.percentComplete,
        message: getFastProgressMessage(state.progress.currentStep, state),
      });
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[Fast Pipeline Runner Stream] Completed in ${duration}ms`);

  if (!receivedState) {
    throw new Error('Fast pipeline execution failed - no final state received');
  }

  const {
    finalMessage,
    markers = [],
    polygons = [],
    errors = [],
  } = finalState;

  console.log(`[Fast Pipeline Runner Stream] Results:`);
  console.log(`  - Message: "${finalMessage}"`);
  console.log(`  - Markers: ${markers.length}`);
  console.log(`  - Errors: ${errors.length}`);

  const result: PipelineResult = {
    message: finalMessage || 'No results found.',
    markers,
    polygons,
    threadId,
    errors: errors.length > 0
      ? errors.map((e) => ({ node: e.node, error: e.error }))
      : undefined,
    metadata: {
      executionTime: duration,
      nodesExecuted: [...FAST_PIPELINE_NODE_NAMES],
    },
  };

  return result;
}

/**
 * Get progress message for fast pipeline
 */
function getFastProgressMessage(step: string, state: PipelineState): string {
  switch (step) {
    case 'intent_extraction':
      return 'Understanding your request...';
    case 'query_generation':
      return 'Generating search queries...';
    case 'fast_search':
      return `Quick search... (found ${state.searchResults?.length || 0} results)`;
    case 'fast_extract':
      return `Extracting places... (${state.extractedPlaces?.length || 0} found)`;
    case 'geocoding':
      return `Getting coordinates... (${state.markers?.length || 0} markers)`;
    case 'summarization':
      return 'Preparing your results...';
    default:
      return `Processing: ${step}`;
  }
}
