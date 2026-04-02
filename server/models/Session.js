class Session {
    constructor(token, playerId, name) {
        this.token = token;
        this.playerId = playerId;
        this.name = name;
        this.status = 'connected';
        this.gameId = null;
        this.expiresAt = null;
    }

    setStatus(status) {
        this.status = status;
    }

    setGameId(gameId) {
        this.gameId = gameId;
    }

    setExpiresAt(timestamp) {
        this.expiresAt = timestamp;
    }

    isExpired() {
        return this.expiresAt && Date.now() > this.expiresAt;
    }

    clearExpiresAt() {
        this.expiresAt = null;
    }

    toJSON() {
        return {
            name: this.name,
            status: this.status,
            gameId: this.gameId
        };
    }
}

module.exports = Session;