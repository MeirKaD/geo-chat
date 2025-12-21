import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";

import { runPipelineAgent, runPipelineAgentStream } from "../services/langgraph";
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

    // Use new pipeline architecture
    const pipelineResult = await runPipelineAgent({
      userMessage: lastMessage.content,
      threadId: resolvedThreadId,
    });

    const responseBody: ChatResponse = {
      role: "assistant",
      content: pipelineResult.message,
      timestamp: new Date().toISOString(),
      threadId: resolvedThreadId,
      map: {
        markers: pipelineResult.markers,
        polygons: pipelineResult.polygons,
      },
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

// Streaming endpoint with Server-Sent Events
router.post("/stream", async (req: Request<{}, {}, ChatRequest>, res: Response) => {
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

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Run pipeline with progress updates
    const pipelineResult = await runPipelineAgentStream(
      {
        userMessage: lastMessage.content,
        threadId: resolvedThreadId,
      },
      (progress) => {
        // Send progress event
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          ...progress
        })}\n\n`);
      }
    );

    // Send final result
    const responseBody: ChatResponse = {
      role: "assistant",
      content: pipelineResult.message,
      timestamp: new Date().toISOString(),
      threadId: resolvedThreadId,
      map: {
        markers: pipelineResult.markers,
        polygons: pipelineResult.polygons,
      },
    };

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      ...responseBody
    })}\n\n`);

    res.end();
  } catch (error) {
    console.error("Chat stream error:", error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    })}\n\n`);
    res.end();
  }
});

export default router;
