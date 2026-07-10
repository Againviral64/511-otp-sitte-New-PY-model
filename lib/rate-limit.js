// Rate limiter utility - In-memory sliding window rate limiter
// Stores request timestamps per key (IP or user ID)

const rateLimitStore = new Map();

// Clean up expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitStore.entries()) {
        const filtered = timestamps.filter(t => now - t < 600000); // Keep last 10 min
        if (filtered.length === 0) {
            rateLimitStore.delete(key);
        } else {
            rateLimitStore.set(key, filtered);
        }
    }
}, 300000);

/**
 * Check rate limit for a given key
 * @param {string} key - Unique identifier (IP, user ID, or composite key)
 * @param {number} maxRequests - Maximum requests allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(key, maxRequests, windowMs) {
    const now = Date.now();
    const timestamps = rateLimitStore.get(key) || [];
    
    // Filter to only timestamps within the current window
    const windowTimestamps = timestamps.filter(t => now - t < windowMs);
    
    if (windowTimestamps.length >= maxRequests) {
        const oldestInWindow = windowTimestamps[0];
        const retryAfterMs = windowMs - (now - oldestInWindow);
        return { allowed: false, remaining: 0, retryAfterMs };
    }
    
    windowTimestamps.push(now);
    rateLimitStore.set(key, windowTimestamps);
    
    return { allowed: true, remaining: maxRequests - windowTimestamps.length, retryAfterMs: 0 };
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
    BUY:          { maxRequests: 5,  windowMs: 60000 },   // 5 per minute
    DEPOSIT:      { maxRequests: 3,  windowMs: 60000 },   // 3 per minute
    SMS_POLL:     { maxRequests: 30, windowMs: 60000 },   // 30 per minute
    API_V1:       { maxRequests: 20, windowMs: 60000 },   // 20 per minute for reseller API
    TICKETS:      { maxRequests: 5,  windowMs: 60000 },   // 5 per minute
    AUTH:         { maxRequests: 5,  windowMs: 300000 },   // 5 per 5 minutes (login/signup)
    GENERAL:      { maxRequests: 60, windowMs: 60000 },   // 60 per minute default
};

/**
 * Get the client identifier from a request (IP-based or user-based)
 * @param {Request} request 
 * @returns {string}
 */
export function getClientKey(request) {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
        || request.headers.get('x-real-ip') 
        || 'unknown';
}
