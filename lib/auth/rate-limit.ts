/**
 * In-Memory Sliding Window Rate Limiter for Authentication & Sensitive Endpoints
 * 
 * Note on Deployment Scope:
 * This rate limiter operates in-memory on the Node.js runtime process.
 * In single-instance or containerized environments (Docker, VPS, single server),
 * it effectively protects against automated brute-force attacks.
 * In horizontally scaled or multi-region serverless deployments, each instance
 * tracks its own memory window; for distributed serverless consistency across
 * multiple regions, Redis/Upstash can be connected as an external adapter.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up stale entries every 10 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < 60 * 60 * 1000);
      if (record.timestamps.length === 0) {
        rateLimitMap.delete(key);
      }
    }
  }, 10 * 60 * 1000);

  // Allow Node process to exit without waiting on this timer
  if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier) || { timestamps: [] };

  // Filter out timestamps outside current sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= maxAttempts) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  return {
    allowed: true,
    remainingAttempts: maxAttempts - record.timestamps.length,
  };
}

export function recordRateLimitAttempt(identifier: string): void {
  const now = Date.now();
  const record = rateLimitMap.get(identifier) || { timestamps: [] };
  record.timestamps.push(now);
  rateLimitMap.set(identifier, record);
}

export function resetRateLimit(identifier: string): void {
  rateLimitMap.delete(identifier);
}
