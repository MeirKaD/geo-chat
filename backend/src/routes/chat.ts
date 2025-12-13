import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";

import { runGeoChatAgent } from "../services/langgraph";
import type { ChatRequest, ChatResponse } from "../types";

const router = Router();

router.post("/", async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const { messages, threadId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== "user") {
      return res
        .status(400)
        .json({ error: "Last message must be from user" });
    }

    const resolvedThreadId =
      threadId || (req.headers["x-client-thread"] as string) || randomUUID();

    const agentResult = await runGeoChatAgent({
      userMessage: lastMessage.content,
      threadId: resolvedThreadId,
    });

    const responseBody: ChatResponse = {
      role: "assistant",
      content: agentResult.content,
      timestamp: new Date().toISOString(),
      threadId: resolvedThreadId,
      map: agentResult.map ?? null,
    };

    res.json(responseBody);
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
