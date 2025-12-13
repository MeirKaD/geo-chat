import {
  MultiServerMCPClient,
  type ClientConfig,
  type StreamableHTTPConnection,
} from "@langchain/mcp-adapters";
import type { DynamicStructuredTool } from "@langchain/core/tools";

const BRIGHTDATA_URL = "https://mcp.brightdata.com/mcp?pro=1";

const buildBrightDataConnection = (
  apiToken: string
): StreamableHTTPConnection => ({
  transport: "http",
  url: BRIGHTDATA_URL,
  headers: {
    Authorization: `Bearer ${apiToken}`,
  },
  automaticSSEFallback: true,
});

const buildClientConfig = (apiToken: string): ClientConfig => ({
  mcpServers: {
    brightdata: buildBrightDataConnection(apiToken),
  },
  throwOnLoadError: true,
  prefixToolNameWithServerName: true,
  additionalToolNamePrefix: "",
  useStandardContentBlocks: false,
  onConnectionError: "throw",
});

export const createMcpClient = (): MultiServerMCPClient => {
  const token = process.env.BRIGHTDATA_API_TOKEN;

  if (!token) {
    throw new Error(
      "BRIGHTDATA_API_TOKEN is required to initialize the MCP client."
    );
  }

  const config = buildClientConfig(token);
  return new MultiServerMCPClient(config);
};

export const loadMcpTools = async (
  client: MultiServerMCPClient
): Promise<DynamicStructuredTool[]> => client.getTools();

export const initializeMcpClient = async (): Promise<{
  client: MultiServerMCPClient;
  tools: DynamicStructuredTool[];
}> => {
  const client = createMcpClient();
  const tools = await loadMcpTools(client);

  return { client, tools };
};
