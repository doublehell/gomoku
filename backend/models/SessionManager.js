const Session = require('./Session');
const { generateSessionToken } = require('../utils/gameLogic');

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

class SessionManager {
    constructor() {
        this.sessions = new Map(); // token -> Session
    }

    /**
     * Create a new session for a player
     * @param {Player} player - Player object
     * @returns {Session} - Created session
     */
    create(player) {
        const token = generateSessionToken();
        const session = new Session(token, player.id, player.name);
        this.sessions.set(token, session);
        return session;
    }

    /**
     * Restore a session by token
     * @param {string} token - Session token
     * @returns {Session|null} - Session if valid, null otherwise
     */
    restore(token) {
        const session = this.sessions.get(token);

        if (!session) {
            return null;
        }

        // Check if expired
        if (session.isExpired()) {
            this.sessions.delete(token);
            return null;
        }

        // Clear expiry for active session
        session.clearExpiresAt();

        return session;
    }

    /**
     * Update player's session status
     * @param {Player} player - Player object
     * @param {string} status - New status
     * @param {number|null} gameId - Game ID (optional)
     */
    updatePlayerStatus(player, status, gameId = null) {
        if (!player.sessionToken) return;

        const session = this.sessions.get(player.sessionToken);
        if (session) {
            session.setStatus(status);
            if (gameId !== null) {
                session.setGameId(gameId);
            }
        }
    }

    /**
     * Set session to expire
     * @param {Player} player - Player object
     */
    setExpiring(player) {
        if (!player.sessionToken) return;

        const session = this.sessions.get(player.sessionToken);
        if (session) {
            session.setExpiresAt(Date.now() + SESSION_EXPIRY_MS);
        }
    }

    /**
     * Get session by token
     * @param {string} token - Session token
     * @returns {Session|null}
     */
    get(token) {
        return this.sessions.get(token) || null;
    }

    /**
     * Delete a session
     * @param {string} token - Session token
     */
    delete(token) {
        this.sessions.delete(token);
    }

    /**
     * Clean up expired sessions
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [token, session] of this.sessions) {
            if (session.isExpired()) {
                this.sessions.delete(token);
                cleaned++;
            }
        }

        return cleaned;
    }

    /**
     * Check if a session exists and is valid
     * @param {string} token - Session token
     * @returns {boolean}
     */
    isValid(token) {
        const session = this.sessions.get(token);
        return session && !session.isExpired();
    }

    /**
     * Get all valid sessions
     * @returns {Session[]}
     */
    getAll() {
        return Array.from(this.sessions.values());
    }
}

module.exports = SessionManager;