import dotenv from "dotenv";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  MemorySaver,
  MessagesAnnotation,
  StateGraph,
  END,
  START,
} from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
  type ContentBlock,
  isAIMessage,
} from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { DynamicStructuredTool } from "@langchain/core/tools";

import { loadToolBundle, type ToolBundle } from "../mcp/index.js";
import { extractMapPayloadFromMessages } from "../tools/mapResponse.js";
import type { MapResponse } from "../tools/index.js";
import { geoSystemPrompt } from "./prompts.js";

dotenv.config();

type GraphState = typeof MessagesAnnotation.State;

const checkpointer = new MemorySaver();
const systemMessage = new SystemMessage(geoSystemPrompt);
const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";
const isGeminiModel = modelName.toLowerCase().includes("gemini");
const rawEnableMcp = process.env.ENABLE_MCP_TOOLS ?? "";
const enableMcpTools = rawEnableMcp.toLowerCase() === "true";

let cachedModel: ChatGoogleGenerativeAI | null = null;
let toolBundlePromise: Promise<ToolBundle> | null = null;
let compiledGraphPromise:
  | Promise<ReturnType<ReturnType<typeof buildWorkflow>["compile"]>>
  | null = null;
let toolLogPrinted = false;
let agentStepCounter = 0;

const renderMessageContent = (message: BaseMessage): string => {
  const { content } = message;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const rendered = content
    .map((block: ContentBlock) => {
      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }
      if (
        block.type === "reasoning" &&
        typeof block.reasoning === "string"
      ) {
        return block.reasoning;
      }
      if (
        block.type === "non_standard" &&
        typeof block.value === "string"
      ) {
        return block.value;
      }
      return "";
    })
    .filter((part) => part.length > 0)
    .join("\n");

  return rendered.trim();
};

function getModel() {
  if (cachedModel) {
    return cachedModel;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to run the LangGraph agent.");
  }

  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";

  cachedModel = new ChatGoogleGenerativeAI({
    apiKey,
    model: modelName,
    temperature: 0,
  });

  return cachedModel;
}

const resolveToolset = async (): Promise<DynamicStructuredTool[]> => {
  const { customTools, allTools } = await getToolBundle();

  const usingCustomOnly = isGeminiModel && !enableMcpTools;
  const selectedTools = usingCustomOnly ? customTools : allTools;

  if (!toolLogPrinted) {
    const selectedNames = selectedTools
      .map((tool) => tool.name ?? "unnamed")
      .join(", ");
    const allNames = allTools.map((tool) => tool.name ?? "unnamed").join(", ");
    console.log(
      `[LangGraph] Tool selection -> model="${modelName}", enableMcpTools=${enableMcpTools}, usingCustomOnly=${usingCustomOnly}`
    );
    console.log(
      `[LangGraph] Selected tools (${selectedTools.length}): ${selectedNames}`
    );
    console.log(`[LangGraph] All tools (${allTools.length}): ${allNames}`);
    toolLogPrinted = true;
  }

  return selectedTools;
};

const callModel = async (state: GraphState) => {
  const conversation = [systemMessage, ...state.messages];
  const tools = await resolveToolset();
  const response = await getModel().bindTools(tools).invoke(conversation);

  const stepId = ++agentStepCounter;
  const toolCalls =
    "tool_calls" in response && Array.isArray(response.tool_calls)
      ? response.tool_calls
      : [];

  if (toolCalls.length > 0) {
    const names = toolCalls
      .map((call) => ("name" in call ? call.name : "unknown"))
      .join(", ");
    console.log(
      `[LangGraph] Agent step ${stepId} tool calls (${toolCalls.length}): ${names}`
    );
  } else {
    const preview = renderMessageContent(response).slice(0, 140);
    console.log(
      `[LangGraph] Agent step ${stepId} tool calls (0). Message preview: "${preview}"`
    );
  }

  return { messages: [response] };
};

const buildWorkflow = (tools: DynamicStructuredTool[]) =>
  new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition)
    .addEdge("tools", "agent")
    .addEdge("agent", END);

export interface RunGeoChatInput {
  threadId: string;
  userMessage: string;
}

export interface AgentResult {
  content: string;
  message: AIMessage;
  map: MapResponse | null;
}

const getToolBundle = async (): Promise<ToolBundle> => {
  if (!toolBundlePromise) {
    toolBundlePromise = loadToolBundle();
  }

  return toolBundlePromise;
};

const getChatGraph = async () => {
  if (!compiledGraphPromise) {
    compiledGraphPromise = (async () => {
      const tools = await resolveToolset();
      const workflow = buildWorkflow(tools);
      return workflow.compile({ checkpointer });
    })();
  }

  return compiledGraphPromise;
};

export async function runGeoChatAgent(
  input: RunGeoChatInput
): Promise<AgentResult> {
  const { threadId, userMessage } = input;

  const config: RunnableConfig = {
    configurable: { thread_id: threadId },
  };

  const graph = await getChatGraph();

  const result = await graph.invoke(
    { messages: [new HumanMessage(userMessage)] },
    config
  );

  const { messages } = result;

  if (messages.length === 0) {
    throw new Error("Agent returned no messages.");
  }

  const maybeAiMessage = messages[messages.length - 1] as BaseMessage;

  if (!isAIMessage(maybeAiMessage)) {
    throw new Error("Agent did not return an AI message.");
  }

  const map = extractMapPayloadFromMessages(messages);

  return {
    content: renderMessageContent(maybeAiMessage),
    message: maybeAiMessage,
    map,
  };
}

export async function* runGeoChatAgentStream(
  input: RunGeoChatInput
): AsyncGenerator<AgentResult> {
  const { threadId, userMessage } = input;
  const graph = await getChatGraph();

  const stream = await graph.stream(
    { messages: [new HumanMessage(userMessage)] },
    {
      streamMode: "values",
      configurable: { thread_id: threadId },
    }
  );

  for await (const { messages } of stream) {
    if (!messages.length) {
      continue;
    }

    const last = messages[messages.length - 1] as BaseMessage;

    if (!isAIMessage(last)) {
      continue;
    }

    const map = extractMapPayloadFromMessages(messages);

    yield {
      content: renderMessageContent(last),
      message: last,
      map,
    };
  }
}
