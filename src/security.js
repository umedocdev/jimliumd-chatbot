const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

export const createRateLimiter = ({
  windowMs = FIFTEEN_MINUTES_MS,
  maxRequests = 5,
} = {}) => {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = getClientIp(req);
    const timestamps = buckets.get(key) || [];
    const recent = timestamps.filter((ts) => now - ts < windowMs);

    if (recent.length >= maxRequests) {
      return res.status(429).json({
        error: "Too many requests. Please wait a few minutes and try again.",
      });
    }

    recent.push(now);
    buckets.set(key, recent);
    return next();
  };
};
