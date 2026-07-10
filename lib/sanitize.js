/**
 * Sanitization utilities to prevent XSS and injection attacks.
 * Use these on all user-provided text inputs before storing in database.
 */

/**
 * Strip HTML tags and dangerous characters from a string.
 * @param {string} str - Raw user input
 * @returns {string} - Sanitized string
 */
export function sanitizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/[<>]/g, '') // Remove angle brackets (prevents HTML injection)
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove inline event handlers (onclick=, onerror=, etc.)
        .trim();
}

/**
 * Sanitize a string and limit its length.
 * @param {string} str - Raw user input
 * @param {number} maxLength - Maximum allowed length
 * @returns {string}
 */
export function sanitizeAndTruncate(str, maxLength = 500) {
    return sanitizeText(str).substring(0, maxLength);
}

/**
 * Validate and sanitize a Transaction ID (alphanumeric + dashes only)
 * @param {string} txId 
 * @returns {string}
 */
export function sanitizeTxId(txId) {
    if (!txId || typeof txId !== 'string') return '';
    return txId.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 100);
}

/**
 * Validate an amount is a positive number within bounds.
 * @param {any} amount - Raw amount input
 * @param {number} min - Minimum allowed
 * @param {number} max - Maximum allowed
 * @returns {{ valid: boolean, value: number, message: string }}
 */
export function validateAmount(amount, min = 1, max = 50000) {
    const num = parseFloat(amount);
    if (isNaN(num) || !isFinite(num)) {
        return { valid: false, value: 0, message: 'Invalid amount format.' };
    }
    if (num < min) {
        return { valid: false, value: num, message: `Minimum amount is ${min}.` };
    }
    if (num > max) {
        return { valid: false, value: num, message: `Maximum amount is ${max}.` };
    }
    return { valid: true, value: num, message: 'OK' };
}
