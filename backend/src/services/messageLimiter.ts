/**
 * Message Limiter Service
 * Tracks and enforces message count limits per threadId
 */

interface MessageCounter {
  threadId: string;
  messageCount: number;
  createdAt: Date;
}

class MessageLimiter {
  private counters: Map<string, MessageCounter>;
  private readonly MESSAGE_LIMIT = 5;

  constructor() {
    this.counters = new Map();
  }

  /**
   * Check if a threadId has reached the message limit
   */
  hasReachedLimit(threadId: string): boolean {
    const counter = this.counters.get(threadId);
    if (!counter) {
      return false;
    }
    return counter.messageCount >= this.MESSAGE_LIMIT;
  }

  /**
   * Get the current message count for a threadId
   */
  getMessageCount(threadId: string): number {
    const counter = this.counters.get(threadId);
    return counter ? counter.messageCount : 0;
  }

  /**
   * Get remaining messages for a threadId
   */
  getRemainingMessages(threadId: string): number {
    const count = this.getMessageCount(threadId);
    return Math.max(0, this.MESSAGE_LIMIT - count);
  }

  /**
   * Increment the message count for a threadId
   */
  incrementCount(threadId: string): number {
    const counter = this.counters.get(threadId);

    if (counter) {
      counter.messageCount++;
      return counter.messageCount;
    } else {
      // Create new counter
      this.counters.set(threadId, {
        threadId,
        messageCount: 1,
        createdAt: new Date()
      });
      return 1;
    }
  }

  /**
   * Reset the counter for a specific threadId
   */
  resetCount(threadId: string): void {
    this.counters.delete(threadId);
  }

  /**
   * Clear all counters (useful for testing)
   */
  clearAll(): void {
    this.counters.clear();
  }

  /**
   * Get the message limit value
   */
  getLimit(): number {
    return this.MESSAGE_LIMIT;
  }
}

// Export singleton instance
export const messageLimiter = new MessageLimiter();
