const WebSocket = require('ws');
const PlayerStatus = require('../enums/PlayerStatus');

class Player {
    constructor(id, ws, ip) {
        this.id = id;
        this.name = null;
        this.ws = ws;
        this.status = PlayerStatus.CONNECTED;
        this.gameId = null;
        this.sessionToken = null;
        this.ip = ip;
        this.loginTime = Date.now();
    }

    setName(name) {
        this.name = name;
    }

    setStatus(status) {
        this.status = status;
    }

    setGameId(gameId) {
        this.gameId = gameId;
    }

    setSessionToken(token) {
        this.sessionToken = token;
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    send(message) {
        if (this.isConnected()) {
            this.ws.send(JSON.stringify(message));
        }
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            gameId: this.gameId,
            ip: this.ip,
            loginTime: this.loginTime
        };
    }
}

module.exports = Player;