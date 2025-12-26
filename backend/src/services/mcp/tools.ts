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
 * Load tool bundle with automatic retry on session expiry.
 * If the first attempt fails with a session error, it resets the cache and retries.
 */
export const loadToolBundleWithRetry = async (): Promise<ToolBundle> => {
  try {
    return await loadToolBundle();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Session not found') || errorMessage.includes('session')) {
      console.log('[MCP Tools] Session expired, reconnecting...');
      resetToolBundle();
      return await loadToolBundle();
    }
    throw error;
  }
};
