/**
 * Simple in-memory IP rate limiter.
 * Not suitable for multi-process deployments (use Redis then), but correct
 * for single-process Node.js deployments where all requests share one process.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Cleanup stale entries every 10 minutes to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}, 10 * 60 * 1000).unref();

/**
 * Returns { ok: true } if the IP is within the rate limit window,
 * or { ok: false, retryAfter: seconds } if it has been exceeded.
 *
 * @param ip          The client IP address string (use req.ip)
 * @param key         Extra namespace key (e.g. "register-tenant") to separate limits per endpoint
 * @param maxRequests Maximum allowed requests in the window
 * @param windowMs    Window duration in milliseconds
 */
export function checkIpRateLimit(
  ip: string,
  key: string,
  maxRequests: number,
  windowMs: number,
): { ok: boolean; retryAfter?: number } {
  const mapKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = store.get(mapKey);

  if (!bucket || bucket.resetAt <= now) {
    store.set(mapKey, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= maxRequests) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { ok: true };
}
