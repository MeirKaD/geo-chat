import type { DynamicStructuredTool } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

import {
  displayOnMapTool,
  geocodeTool,
  isochroneTool,
  searchQueryTool,
} from "../tools";
import { initializeMcpClient } from "./client";

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
