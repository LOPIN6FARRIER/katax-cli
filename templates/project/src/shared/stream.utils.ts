/**
 * Stream Response Utilities
 */
/**
 * Server-Sent Events (SSE) and streaming responses
 */

import type { Request, Response } from 'express';

// ==================== SERVER-SENT EVENTS (SSE) ====================

/**
 * Initialize SSE connection with proper headers
 */
export function initSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();
}

/**
 * Send SSE event
 */
export function sendSSEEvent(
  res: Response,
  data: unknown,
  event?: string,
  id?: string
): boolean {
  try {
    if (id) {
      res.write(`id: ${id}\n`);
    }
    if (event) {
      res.write(`event: ${event}\n`);
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    console.error("Failed to send SSE event", error);
    return false;
  }
}

/**
 * Send SSE comment (keeps connection alive)
 */
export function sendSSEComment(res: Response, comment: string = "ping"): boolean {
  try {
    res.write(`: ${comment}\n\n`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Close SSE connection gracefully
 */
export function closeSSE(res: Response): void {
  try {
    res.write("event: close\n");
    res.write("data: {}\n\n");
    res.end();
  } catch (error) {
    console.error("Failed to close SSE connection", error);
  }
}

// ==================== SSE STREAM MANAGER ====================

/**
 * Manages SSE connection with automatic cleanup
 */
export class SSEStream {
  private closed = false;
  private keepAliveInterval?: NodeJS.Timeout;

  constructor(
    private res: Response,
    private keepAliveMs: number = 30000
  ) {
    initSSE(res);
    this.setupKeepAlive();
    this.setupCleanup();
  }

  private setupKeepAlive(): void {
    this.keepAliveInterval = setInterval(() => {
      if (!this.closed) {
        sendSSEComment(this.res);
      }
    }, this.keepAliveMs);
  }

  private setupCleanup(): void {
    this.res.on("close", () => {
      this.close();
    });
  }

  send(data: unknown, event?: string, id?: string): boolean {
    if (this.closed) return false;
    return sendSSEEvent(this.res, data, event, id);
  }

  sendError(error: Error | string): boolean {
    const errorData = typeof error === "string"
      ? { message: error }
      : { message: error.message, stack: error.stack };
    return this.send(errorData, "error");
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    closeSSE(this.res);
  }

  isClosed(): boolean {
    return this.closed;
  }
}

// ==================== CHUNKED TRANSFER ENCODING ====================

/**
 * Send chunked response - useful for large data
 */
export function sendChunked(
  res: Response,
  data: unknown,
  options?: {
    contentType?: string;
    headers?: Record<string, string>;
  }
): void {
  const contentType = options?.contentType || "application/json";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Transfer-Encoding", "chunked");

  if (options?.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  const chunk = typeof data === "string" ? data : JSON.stringify(data);
  res.write(chunk);
  res.end();
}

/**
 * Stream async iterator - sends data as it becomes available
 */
export async function streamAsyncIterator<T>(
  res: Response,
  iterator: AsyncIterable<T>,
  options?: {
    transform?: (item: T) => unknown;
    onError?: (error: Error) => void;
    contentType?: string;
  }
): Promise<void> {
  try {
    const contentType = options?.contentType || "application/x-ndjson";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Transfer-Encoding", "chunked");

    for await (const item of iterator) {
      const data = options?.transform ? options.transform(item) : item;
      const chunk = JSON.stringify(data) + "\n";
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    if (options?.onError) {
      options.onError(error as Error);
    }
    console.error("Stream error", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Stream failed" });
    }
  }
}

/**
 * Stream array in chunks - useful for paginated data
 */
export async function streamArray<T>(
  res: Response,
  items: T[],
  chunkSize: number = 100,
  delayMs: number = 0
): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");

  res.write("[");

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const json = chunk.map(item => JSON.stringify(item)).join(",");
    res.write(i === 0 ? json : "," + json);

    if (delayMs > 0 && i + chunkSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  res.write("]");
  res.end();
}

// ==================== EXAMPLE USAGE ====================

/**
 * Example: SSE endpoint
 */
/**
 * export async function streamEventsHandler(req: Request, res: Response) {
 */
/**
 *   const stream = new SSEStream(res);
 */
/**
 * 
 */
/**
 *   try {
 */
/**
 *     for (let i = 0; i < 10; i++) {
 */
/**
 *       stream.send({ count: i, timestamp: Date.now() }, "update");
 */
/**
 *       await new Promise(resolve => setTimeout(resolve, 1000));
 */
/**
 *     }
 */
/**
 *     stream.close();
 */
/**
 *   } catch (error) {
 */
/**
 *     stream.sendError(error as Error);
 */
/**
 *     stream.close();
 */
/**
 *   }
 */
/**
 * }
 */

/**
 * Example: Stream database results
 */
/**
 * export async function streamUsersHandler(req: Request, res: Response) {
 */
/**
 *   const users = await db.query("SELECT * FROM users");
 */
/**
 *   await streamArray(res, users, 50);
 */
/**
 * }
 */
