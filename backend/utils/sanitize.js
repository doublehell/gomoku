/**
 * Sanitize HTML to prevent XSS attacks
 * @param {string} input - Raw user input
 * @returns {string} - Sanitized string
 */
function sanitizeHtml(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

module.exports = {
    sanitizeHtml
};