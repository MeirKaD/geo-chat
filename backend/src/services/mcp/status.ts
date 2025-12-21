import { loadToolBundle } from "./tools.js";

export interface McpStatus {
  serverCount: number;
  toolCount: number;
  toolNames: string[];
}

export const warmMcpConnections = async (): Promise<McpStatus> => {
  const { client, mcpTools, customTools, allTools } = await loadToolBundle();

  // Count servers from the client configuration
  const serverNames = Object.keys(client.config.mcpServers ?? {});

  const toolNames = allTools
    .map((tool) => tool.name)
    .filter((name): name is string => Boolean(name));

  return {
    serverCount: serverNames.length,
    toolCount: allTools.length,
    toolNames,
  };
};
