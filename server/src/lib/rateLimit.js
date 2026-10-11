// In-memory sliding-window limiter. Good enough for a single free-tier
// instance; a multi-instance deploy would need a shared store like Redis.
export function rateLimit({ limit, windowMs, key }) {
  const hits = new Map();

  return (req, res, next) => {
    const id = key(req);
    const now = Date.now();
    const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= limit) {
      const retryAfter = Math.ceil((recent[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Too many requests. Try again in ${Math.ceil(retryAfter / 60)} min.` });
    }

    recent.push(now);
    hits.set(id, recent);

    // Occasionally drop keys with no recent hits so the map can't grow forever.
    if (hits.size > 1000) {
      for (const [k, times] of hits) if (now - times.at(-1) >= windowMs) hits.delete(k);
    }
    next();
  };
}
