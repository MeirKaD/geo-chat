import type { DynamicStructuredTool } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

import {
  displayOnMapTool,
  geocodeTool,
  isochroneTool,
  searchQueryTool,
} from "../tools/index.js";
import { initializeMcpClient } from "./client.js";

export interface ToolBundle {
  client: MultiServerMCPClient;
  mcpTools: DynamicStructuredTool[];
  customTools: DynamicStructuredTool[];
  allTools: DynamicStructuredTool[];
}

let toolBundlePromise: Promise<ToolBundle> | null = null;

// On Vercel, don't cache MCP connections as they become stale between invocations
const isVercel = !!process.env.VERCEL;

const buildCustomTools = (): DynamicStructuredTool[] => [
  geocodeTool,
  isochroneTool,
  displayOnMapTool,
  searchQueryTool,
];

/**
 * Reset the tool bundle cache.
 * Call this when MCP session expires to force reconnection.
 */
export const resetToolBundle = (): void => {
  console.log('[MCP Tools] Resetting tool bundle cache');
  toolBundlePromise = null;
};

export const loadToolBundle = async (): Promise<ToolBundle> => {
  // On Vercel, always create a fresh connection to avoid stale session issues
  if (isVercel) {
    console.log('[MCP Tools] Vercel environment detected - creating fresh MCP connection');
    const { client, tools: mcpTools } = await initializeMcpClient();
    const customTools = buildCustomTools();

    return {
      client,
      mcpTools,
      customTools,
      allTools: [...mcpTools, ...customTools],
    };
  }

  // Local/other environments: use cached connection
  if (!toolBundlePromise) {
    toolBundlePromise = (async () => {
      const { client, tools: mcpTools } = await initializeMcpClient();
      const customTools = buildCustomTools();

      return {
        client,
        mcpTools,
        customTools,
        allTools: [...mcpTools, ...customTools],
      };
    })();
  }

  return toolBundlePromise;
};

/**
 * Check if an error is recoverable (should trigger a retry)
 */
const isRecoverableError = (error: unknown): boolean => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return (
    errorMessage.includes('Session not found') ||
    errorMessage.includes('session') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('Failed to connect') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND')
  );
};

/**
 * Load tool bundle with automatic retry on connection/session errors.
 * If the first attempt fails with a recoverable error, it resets the cache and retries.
 */
export const loadToolBundleWithRetry = async (
  maxRetries = 2
): Promise<ToolBundle> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await loadToolBundle();
    } catch (error) {
      lastError = error;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (isRecoverableError(error) && attempt < maxRetries) {
        console.log(
          `[MCP Tools] Connection failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`
        );
        console.log("[MCP Tools] Resetting cache and retrying...");
        resetToolBundle();
        // Small delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
};
