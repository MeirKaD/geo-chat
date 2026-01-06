import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { messageLimiter } from '../services/messageLimiter.js';

/**
 * Middleware to enforce message limits per threadId
 * Returns 429 Too Many Requests if limit is exceeded
 */
export function messageLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Resolve threadId using the same logic as chat routes
  const threadId =
    req.body.threadId ||
    (req.headers['x-client-thread'] as string) ||
    randomUUID();

  // Check if limit has been reached
  if (messageLimiter.hasReachedLimit(threadId)) {
    res.status(429).json({
      error: 'Message limit exceeded',
      message: `You have reached the maximum of ${messageLimiter.getLimit()} messages. Please clone the repository or get free web access credits to continue.`,
      limit: messageLimiter.getLimit(),
      current: messageLimiter.getMessageCount(threadId),
      remaining: 0,
      threadId
    });
    return;
  }

  // Increment the counter for this request
  const newCount = messageLimiter.incrementCount(threadId);

  // Attach threadId and count to request for potential use in handlers
  (req as any).resolvedThreadId = threadId;
  (req as any).messageCount = newCount;

  // Add rate limit info to response headers
  res.setHeader('X-RateLimit-Limit', messageLimiter.getLimit().toString());
  res.setHeader('X-RateLimit-Remaining', messageLimiter.getRemainingMessages(threadId).toString());
  res.setHeader('X-RateLimit-Used', newCount.toString());

  next();
}
