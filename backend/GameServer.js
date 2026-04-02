const http = require('http');
const WebSocket = require('ws');

const Player = require('./models/Player');
const GameRoom = require('./models/GameRoom');
const SessionManager = require('./models/SessionManager');
const PlayerStatus = require('./enums/PlayerStatus');
const TimerManager = require('./TimerManager');
const MessageHandler = require('./MessageHandler');

const PORT = 3000;

/**
 * GameServer - Main entry point
 * Responsibilities:
 * - HTTP server setup
 * - WebSocket server setup
 * - Connection lifecycle
 * - Broadcasting coordination
 * - Timer coordination
 */
class GameServer {
    constructor() {
        this.wss = null;
        this.server = null;
        this.players = new Map(); // ws -> Player

        // Core components
        this.sessionManager = new SessionManager();
        this.gameRoom = new GameRoom(this);
        this.timerManager = new TimerManager();
        this.messageHandler = new MessageHandler(this, this.gameRoom, this.sessionManager);

        // Chat cooldown tracking
        this.lastChatTime = new Map(); // ws -> timestamp

        this._setupTimers();
    }

    _setupTimers() {
        // Session cleanup - every minute
        this.timerManager.addInterval(() => {
            const cleaned = this.sessionManager.cleanup();
            if (cleaned > 0) {
                this.log(`清理了 ${cleaned} 個過期 session`);
            }
        }, 60000, 'session_cleanup');

        // Broadcast status - every 5 seconds
        this.timerManager.addInterval(() => {
            this.broadcastQueueStatus();
            this.broadcastPlayerList();
            this.broadcastSpectatorList();
        }, 5000, 'status_broadcast');

        // Time sync - every 3 seconds for active games
        this.timerManager.addInterval(() => {
            this.gameRoom.games.forEach(game => {
                if (!game.gameOver) {
                    const remaining = game.getRemainingTime(60000);
                    this.broadcastToGame({
                        type: 'time_sync',
                        remaining: remaining
                    }, game);
                }
            });
        }, 3000, 'time_sync');

        // Heartbeat - ping clients every 30 seconds to detect disconnection
        this.timerManager.addInterval(() => {
            this.wss.clients.forEach(client => {
                if (client.isAlive === false) {
                    // No pong received, terminate connection
                    const player = this.players.get(client);
                    this.log(`心跳檢測失敗，斷開玩家: ${player?.name || client.id}`);
                    return client.terminate();
                }

                // Mark as not alive and send ping
                client.isAlive = false;
                client.ping();
            });
        }, 30000, 'heartbeat');
    }

    start() {
        // Create HTTP server
        this.server = http.createServer((req, res) => this._handleHttpRequest(req, res));

        // Create WebSocket server with path filtering
        this.wss = new WebSocket.Server({ noServer: true });

        this.server.on('upgrade', (request, socket, head) => {
            const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

            if (pathname === '/ws') {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            } else {
                socket.destroy();
            }
        });

        this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));

        this.server.listen(PORT, () => {
            this.log(`伺服器運行於 http://localhost:${PORT}`);
            this.log(`WebSocket 端點: ws://localhost:${PORT}/ws`);
        });
    }

    _handleHttpRequest(req, res) {
        // Health check for Kubernetes
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', players: this.wss.clients.size }));
            return;
        }

        // Unknown endpoint
        res.writeHead(404);
        res.end('Not Found');
    }

    _handleConnection(ws, req) {
        // Initialize heartbeat tracking
        ws.isAlive = true;

        const playerId = Date.now() + Math.random();
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket.remoteAddress
            || 'unknown';

        const player = new Player(playerId, ws, clientIP);
        this.players.set(ws, player);

        this.log(`玩家 ${playerId} 連線, IP: ${clientIP}`);

        // Handle pong response for heartbeat
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // Request login
        this.send(ws, { type: 'login_request' });

        ws.on('message', (data) => this._handleMessage(ws, data));
        ws.on('close', () => this._handleClose(ws));
    }

    _handleMessage(ws, data) {
        try {
            const message = JSON.parse(data);
            this.messageHandler.handle(ws, message);
        } catch (e) {
            this.log(`處理訊息錯誤: ${e.message}`);
        }
    }

    _handleClose(ws) {
        const player = this.players.get(ws);
        if (!player) return;

        this.log(`玩家 ${player.name || player.id} 離線`);

        // Handle player leaving queue/game
        this.gameRoom.handlePlayerDisconnect(ws);

        // Remove player
        this.players.delete(ws);

        // Clean up chat time
        this.lastChatTime.delete(ws);

        // Set session to expire
        this.sessionManager.setExpiring(player);

        // Update lists
        this.broadcastPlayerList();
        this.broadcastSpectatorList();
    }

    // ==================== Helper Methods ====================

    isNameTaken(name, excludeWs = null) {
        for (const [ws, player] of this.players) {
            if (ws !== excludeWs && player.name === name) {
                return true;
            }
        }
        return false;
    }

    // ==================== Broadcast Methods ====================

    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    broadcastToAll(message) {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }

    broadcastToGame(message, game) {
        const msgStr = JSON.stringify(message);

        // Broadcast to players
        game.players.forEach(player => {
            if (player && player.ws && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(msgStr);
            }
        });

        // Broadcast to spectators
        game.spectators.forEach(spectator => {
            if (spectator.readyState === WebSocket.OPEN) {
                spectator.send(msgStr);
            }
        });
    }

    broadcastQueueStatus() {
        this.broadcastToAll({
            type: 'queue_status',
            count: this.gameRoom.getQueueCount()
        });
    }

    broadcastPlayerList() {
        const playerList = [];

        this.players.forEach(player => {
            if (!player.name) return;
            if (player.status === PlayerStatus.WAITING || player.status === PlayerStatus.SPECTATING) return;

            playerList.push({ name: player.name, status: player.status });
        });

        this.broadcastToAll({ type: 'player_list', players: playerList });
    }

    broadcastSpectatorList() {
        const spectatorNames = [];
        const waitingNames = [];

        this.players.forEach(player => {
            if (!player.name) return;

            if (player.status === PlayerStatus.WAITING) {
                waitingNames.push(player.name);
            } else if (player.status === PlayerStatus.SPECTATING) {
                spectatorNames.push(player.name);
            }
        });

        this.broadcastToAll({
            type: 'spectator_list',
            spectators: spectatorNames,
            waiting: waitingNames
        });
    }

    /**
     * 廣播大廳狀態 (lobby_state)
     */
    broadcastLobbyState() {
        console.log('[Server] Broadcasting lobby_state')
        const waiting = [];
        const spectators = [];
        const players = [];

        this.players.forEach(player => {
            if (!player.name) return;

            switch (player.status) {
                case PlayerStatus.QUEUE:
                    waiting.push(player.name);
                    break;
                case PlayerStatus.SPECTATING:
                    spectators.push(player.name);
                    break;
                case PlayerStatus.PLAYING:
                    players.push({ name: player.name, status: player.status });
                    break;
            }
        });

        this.broadcastToAll({
            type: 'lobby_state',
            waiting,
            spectators,
            players
        });
    }

    getAllPlayers() {
        return Array.from(this.players.values());
    }

    log(message) {
        console.log(message);
    }
}

module.exports = GameServer;