import { ApiError } from '../lib/errors.js';

// छोटा सा in-memory rate limit — पूरे ऐप का लॉगिन एक ही पासवर्ड से होता है,
// इसलिए पासवर्ड बार-बार अंदाज़ा लगाने की कोशिश रोकना ज़रूरी है.
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (now > b.resetAt) buckets.delete(key);
}, 10 * 60 * 1000).unref();

// name दें तो पूरे route की एक ही गिनती (जैसे /bills/:code — वरना हर नंबर की अलग गिनती बनती)
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 20, message, name } = {}) {
  return (req, res, next) => {
    const key = (req.ip || 'unknown') + ':' + (name || req.path);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - b.count));
    if (b.count > max) {
      const mins = Math.ceil((b.resetAt - now) / 60000);
      return next(
        new ApiError(429, message || 'बहुत ज़्यादा कोशिशें — ' + mins + ' मिनट बाद दोबारा करें'),
      );
    }
    next();
  };
}

/** सही पासवर्ड डालने के बाद गिनती हटा दें */
export function clearRateLimit(req) {
  buckets.delete((req.ip || 'unknown') + ':' + req.path);
}
