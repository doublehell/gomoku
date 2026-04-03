/**
 * RateLimiter - Controls message frequency per client
 */
class RateLimiter {
    constructor(options = {}) {
        this.maxMessages = options.maxMessages || 30; // max messages
        this.windowMs = options.windowMs || 1000; // time window in ms
        this.clients = new Map(); // ws -> { count, resetTime }
    }

    /**
     * Check if client is allowed to send a message
     * @param {WebSocket} ws - Client WebSocket
     * @returns {boolean} - true if allowed, false if rate limited
     */
    check(ws) {
        const now = Date.now();
        let clientData = this.clients.get(ws);

        if (!clientData || now > clientData.resetTime) {
            // New window
            clientData = {
                count: 1,
                resetTime: now + this.windowMs
            };
            this.clients.set(ws, clientData);
            return true;
        }

        if (clientData.count >= this.maxMessages) {
            return false;
        }

        clientData.count++;
        return true;
    }

    /**
     * Remove client from rate limiter
     * @param {WebSocket} ws - Client WebSocket
     */
    remove(ws) {
        this.clients.delete(ws);
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        for (const [ws, data] of this.clients) {
            if (now > data.resetTime) {
                this.clients.delete(ws);
            }
        }
    }
}

module.exports = RateLimiter;