import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";

import {
  runPipelineAgent,
  runPipelineAgentStream,
  runFastPipelineAgent,
  runFastPipelineAgentStream,
} from "../services/langgraph/index.js";
import type { ChatRequest, ChatResponse } from "../types/index.js";
import { messageLimitMiddleware } from "../middleware/messageLimitMiddleware.js";

const router = Router();

// Apply message limit middleware to all chat routes
router.use(messageLimitMiddleware);

router.post("/", async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const { messages, threadId, fastMode } = req.body;

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

    // Choose pipeline based on fastMode flag
    const runPipeline = fastMode ? runFastPipelineAgent : runPipelineAgent;
    console.log(`[Chat] Using ${fastMode ? 'FAST' : 'FULL'} pipeline`);

    const pipelineResult = await runPipeline({
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
    const { messages, threadId, fastMode } = req.body;

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

    // Choose pipeline based on fastMode flag
    const runPipelineStream = fastMode ? runFastPipelineAgentStream : runPipelineAgentStream;
    console.log(`[Chat Stream] Using ${fastMode ? 'FAST' : 'FULL'} pipeline`);

    // Run pipeline with progress updates
    const pipelineResult = await runPipelineStream(
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

    // SSE data lines cannot contain raw newlines - they must be escaped in the JSON
    // JSON.stringify handles this, but we need to ensure no literal newlines slip through
    const jsonData = JSON.stringify({
      type: 'complete',
      ...responseBody
    });

    res.write(`data: ${jsonData}\n\n`);

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

// Endpoint to reset message counter for a thread
router.post("/reset", async (req: Request, res: Response) => {
  try {
    const { threadId } = req.body;

    if (!threadId) {
      return res.status(400).json({ error: "threadId is required" });
    }

    const { messageLimiter } = await import("../services/messageLimiter.js");
    messageLimiter.resetCount(threadId);

    res.json({
      success: true,
      message: "Message counter reset successfully",
      threadId
    });
  } catch (error) {
    console.error("Reset counter error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
