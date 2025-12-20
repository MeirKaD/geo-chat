/**
 * Pipeline State Schema
 *
 * Defines the LangGraph state annotation for the pipeline architecture.
 * This replaces the simple MessagesAnnotation with a custom state that
 * tracks all data flowing through the pipeline nodes.
 */

import { Annotation } from '@langchain/langgraph';
import {
  GeoChatState,
  ExtractedIntent,
  GeneratedQuery,
  SearchResult,
  ScrapedPage,
  PlaceData,
} from '../../types/pipeline.js';
import { MapMarker, MapPolygon } from '../tools/schemas.js';

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
   * Reducer: Append (accumulate results from multiple searches)
   */
  searchResults: Annotation<SearchResult[]>({
    reducer: (current, newValue) => {
      if (!newValue) return current || [];
      if (!current) return newValue;
      return [...current, ...newValue];
    },
    default: () => [],
  }),

  /**
   * Scraped page content
   * Reducer: Append (accumulate scraped pages)
   */
  scrapedContent: Annotation<ScrapedPage[]>({
    reducer: (current, newValue) => {
      if (!newValue) return current || [];
      if (!current) return newValue;
      return [...current, ...newValue];
    },
    default: () => [],
  }),

  // ===== Node 4: Data Extraction =====

  /**
   * Extracted structured place data
   * Reducer: Append (accumulate places from multiple extractions)
   */
  extractedPlaces: Annotation<PlaceData[]>({
    reducer: (current, newValue) => {
      if (!newValue) return current || [];
      if (!current) return newValue;
      return [...current, ...newValue];
    },
    default: () => [],
  }),

  // ===== Node 5: Geocoding =====

  /**
   * Map markers with geocoded coordinates
   * Reducer: Append (accumulate markers as they're geocoded)
   */
  markers: Annotation<MapMarker[]>({
    reducer: (current, newValue) => {
      if (!newValue) return current || [];
      if (!current) return newValue;
      return [...current, ...newValue];
    },
    default: () => [],
  }),

  /**
   * Map polygons (isochrones, boundaries, etc.)
   * Reducer: Append (accumulate polygons)
   */
  polygons: Annotation<MapPolygon[]>({
    reducer: (current, newValue) => {
      if (!newValue) return current || [];
      if (!current) return newValue;
      return [...current, ...newValue];
    },
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
   * Reducer: Append (accumulate all errors)
   */
  errors: Annotation<Array<{ node: string; error: string; timestamp: Date }>>({
    reducer: (current, newValue) => {
      if (!newValue) return current || [];
      if (!current) return newValue;
      return [...current, ...newValue];
    },
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
  threadId: string
): Partial<PipelineState> {
  return {
    userMessage,
    threadId,
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
