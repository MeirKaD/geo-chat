

import { Annotation } from '@langchain/langgraph';
import {
  GeoChatState,
  ExtractedIntent,
  GeneratedQuery,
  SearchResult,
  ScrapedPage,
  PlaceData,
  ConversationContext,
  ConversationMessage,
} from '../../types/pipeline.js';
import { MapMarker, MapPolygon } from '../tools/schemas.js';

/**
 * Create an append reducer that supports explicit reset.
 * - Pass an empty array [] to reset the channel (clears all previous data)
 * - Pass undefined/null to keep the current value
 * - Pass an array with items to append to current value
 *
 * This is used for channels that accumulate data within a single pipeline run
 * but should be reset at the start of each new turn/conversation message.
 */
function createResettableAppendReducer<T>() {
  return (current: T[] | undefined, newValue: T[] | undefined): T[] => {
    // If newValue is explicitly an empty array, treat it as a reset signal
    // This happens when we start a new turn and want to clear old data
    if (Array.isArray(newValue) && newValue.length === 0) {
      return [];
    }
    if (!newValue) return current || [];
    if (!current) return newValue;
    return [...current, ...newValue];
  };
}

/**
 * Pipeline State Annotation
 *
 * This annotation defines:
 * 1. The shape of the state (all channels)
 * 2. How updates are merged (reducer functions)
 * 3. Default values for each channel
 */
export const PipelineStateAnnotation = Annotation.Root({
  // ===== Input Channels =====

  /**
   * User's original message
   * Reducer: Replace (latest message wins)
   */
  userMessage: Annotation<string>({
    reducer: (_, newValue) => newValue,
    default: () => '',
  }),

  /**
   * Thread ID for conversation context
   * Reducer: Replace (latest value wins)
   */
  threadId: Annotation<string>({
    reducer: (_, newValue) => newValue,
    default: () => '',
  }),

  /**
   * Conversation history for multi-turn support
   * Contains previous messages and the last extracted intent
   * Reducer: Replace (updated each turn with new context)
   */
  conversationHistory: Annotation<ConversationContext>({
    reducer: (_, newValue) => newValue,
    default: () => ({ messages: [], previousIntent: null }),
  }),

  // ===== Node 1: Intent Extraction =====

  /**
   * Extracted intent from user message
   * Reducer: Replace (each extraction replaces previous)
   */
  extractedIntent: Annotation<ExtractedIntent | null>({
    reducer: (_, newValue) => newValue,
    default: () => null,
  }),

  // ===== Node 2: Query Generation =====

  /**
   * Generated search queries
   * Reducer: Replace (new queries replace old ones)
   */
  generatedQueries: Annotation<GeneratedQuery | null>({
    reducer: (_, newValue) => newValue,
    default: () => null,
  }),

  // ===== Node 3: Search & Scrape =====

  /**
   * Raw search results
   * Reducer: Resettable append (pass empty array to reset, otherwise accumulates)
   */
  searchResults: Annotation<SearchResult[]>({
    reducer: createResettableAppendReducer<SearchResult>(),
    default: () => [],
  }),

  /**
   * Scraped page content
   * Reducer: Resettable append (pass empty array to reset, otherwise accumulates)
   */
  scrapedContent: Annotation<ScrapedPage[]>({
    reducer: createResettableAppendReducer<ScrapedPage>(),
    default: () => [],
  }),

  // ===== Node 4: Data Extraction =====

  /**
   * Extracted structured place data
   * Reducer: Resettable append (pass empty array to reset, otherwise accumulates)
   */
  extractedPlaces: Annotation<PlaceData[]>({
    reducer: createResettableAppendReducer<PlaceData>(),
    default: () => [],
  }),

  // ===== Node 5: Geocoding =====

  /**
   * Map markers with geocoded coordinates
   * Reducer: Resettable append (pass empty array to reset, otherwise accumulates)
   */
  markers: Annotation<MapMarker[]>({
    reducer: createResettableAppendReducer<MapMarker>(),
    default: () => [],
  }),

  /**
   * Map polygons (isochrones, boundaries, etc.)
   * Reducer: Resettable append (pass empty array to reset, otherwise accumulates)
   */
  polygons: Annotation<MapPolygon[]>({
    reducer: createResettableAppendReducer<MapPolygon>(),
    default: () => [],
  }),

  // ===== Node 6: Summarization =====

  /**
   * Final AI-generated message/summary
   * Reducer: Replace (latest summary wins)
   */
  finalMessage: Annotation<string>({
    reducer: (_, newValue) => newValue,
    default: () => '',
  }),

  // ===== Metadata & Error Handling =====

  /**
   * Errors encountered during pipeline execution
   * Reducer: Resettable append (pass empty array to reset, otherwise accumulates)
   */
  errors: Annotation<Array<{ node: string; error: string; timestamp: Date }>>({
    reducer: createResettableAppendReducer<{ node: string; error: string; timestamp: Date }>(),
    default: () => [],
  }),

  /**
   * Progress tracking
   * Reducer: Replace (latest progress wins)
   */
  progress: Annotation<{ currentStep: string; percentComplete: number }>({
    reducer: (_, newValue) => newValue,
    default: () => ({ currentStep: 'starting', percentComplete: 0 }),
  }),
});

/**
 * Type inference for the state
 * Use this type when writing node functions
 */
export type PipelineState = typeof PipelineStateAnnotation.State;

/**
 * Type for state updates
 * Use this when returning from node functions
 */
export type PipelineStateUpdate = Partial<PipelineState>;

/**
 * Helper function to create an initial state
 */
export function createInitialState(
  userMessage: string,
  threadId: string,
  conversationHistory?: ConversationContext
): Partial<PipelineState> {
  return {
    userMessage,
    threadId,
    conversationHistory: conversationHistory ?? { messages: [], previousIntent: null },
    extractedIntent: null,
    generatedQueries: null,
    searchResults: [],
    scrapedContent: [],
    extractedPlaces: [],
    markers: [],
    polygons: [],
    finalMessage: '',
    errors: [],
    progress: {
      currentStep: 'starting',
      percentComplete: 0,
    },
  };
}

/**
 * Helper function to update progress
 */
export function createProgressUpdate(
  step: string,
  percent: number
): PipelineStateUpdate {
  return {
    progress: {
      currentStep: step,
      percentComplete: Math.min(100, Math.max(0, percent)),
    },
  };
}

/**
 * Helper function to add an error
 */
export function createErrorUpdate(
  node: string,
  error: string | Error
): PipelineStateUpdate {
  const errorMessage = typeof error === 'string' ? error : error.message;

  return {
    errors: [
      {
        node,
        error: errorMessage,
        timestamp: new Date(),
      },
    ],
  };
}
