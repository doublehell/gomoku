const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const Player = require('./models/Player');
const GameRoom = require('./models/GameRoom');
const SessionManager = require('./models/SessionManager');
const PlayerStatus = require('./enums/PlayerStatus');
const Game = require('./models/Game');
const { checkWin, BOARD_SIZE } = require('./utils/gameLogic');

const PORT = 3000;
const CHAT_COOLDOWN_MS = 1000;

class GameServer {
    constructor() {
        this.wss = null;
        this.server = null;
        this.players = new Map(); // ws -> Player
        this.sessionManager = new SessionManager();
        this.gameRoom = new GameRoom(this);
        this.lastChatTime = new Map(); // ws -> timestamp

        this._setupTimers();
    }

    _setupTimers() {
        // Session cleanup - every minute
        setInterval(() => {
            const cleaned = this.sessionManager.cleanup();
            if (cleaned > 0) {
                this.log(`清理了 ${cleaned} 個過期 session`);
            }
        }, 60000);

        // Broadcast status - every 5 seconds
        setInterval(() => {
            this.broadcastQueueStatus();
            this.broadcastPlayerList();
            this.broadcastSpectatorList();
        }, 5000);

        // Time sync - every 3 seconds for active games
        setInterval(() => {
            this.gameRoom.games.forEach(game => {
                if (!game.gameOver) {
                    const remaining = game.getRemainingTime(Game.TIMEOUT_MS);
                    this.broadcastToGame({
                        type: 'time_sync',
                        remaining: remaining
                    }, game);
                }
            });
        }, 3000);
    }

    start() {
        // Create HTTP server
        this.server = http.createServer((req, res) => this._handleHttpRequest(req, res));

        // Create WebSocket server
        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));

        this.server.listen(PORT, () => {
            this.log(`伺服器運行於 http://localhost:${PORT}`);
            this.log(`開啟瀏覽器訪問 http://localhost:${PORT}/gomoku-online.html`);
        });
    }

    _handleHttpRequest(req, res) {
        // Health check for Kubernetes
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', players: this.wss.clients.size }));
            return;
        }

        // Path Traversal protection
        let urlPath = req.url.split('?')[0];
        urlPath = decodeURIComponent(urlPath);

        if (urlPath.includes('..')) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        const normalizedPath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
        if (normalizedPath.startsWith('/') || normalizedPath.match(/^[a-zA-Z]:/)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        let filePath = urlPath === '/' ? '/gomoku-online.html' : normalizedPath;
        filePath = path.join(__dirname, filePath);

        const extname = path.extname(filePath);
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css'
        };

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentTypes[extname] || 'text/plain' });
            res.end(content);
        });
    }

    _handleConnection(ws, req) {
        const playerId = Date.now() + Math.random();
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.socket.remoteAddress
            || 'unknown';

        const player = new Player(playerId, ws, clientIP);
        this.players.set(ws, player);

        this.log(`玩家 ${playerId} 連線, IP: ${clientIP}`);

        // Request login
        this._send(ws, { type: 'login_request' });

        ws.on('message', (data) => this._handleMessage(ws, data));
        ws.on('close', () => this._handleClose(ws));
    }

    _handleMessage(ws, data) {
        try {
            const message = JSON.parse(data);
            const player = this.players.get(ws);

            if (!player) return;

            switch (message.type) {
                case 'login':
                    this._handleLogin(ws, player, message);
                    break;

                case 'join_queue':
                    this.gameRoom.addToQueue(player);
                    break;

                case 'leave_queue':
                    this.gameRoom.removeFromQueue(player);
                    break;

                case 'restore_session':
                    this._handleRestoreSession(ws, player, message);
                    break;

                case 'move':
                    this._handleMove(ws, player, message);
                    break;

                case 'chat':
                    this._handleChat(ws, player, message);
                    break;
            }
        } catch (e) {
            this.log(`處理訊息錯誤: ${e.message}`);
        }
    }

    _handleLogin(ws, player, message) {
        const name = (message.name || '').trim().substring(0, 20);

        if (name.length < 2) {
            this._send(ws, { type: 'error', message: '暱稱需要2-20個字' });
            return;
        }

        // Check name uniqueness
        const nameTaken = this.isNameTaken(name, ws);
        if (nameTaken) {
            this._send(ws, { type: 'error', message: '此暱稱已被使用' });
            return;
        }

        player.setName(name);
        player.setStatus(PlayerStatus.WAITING);

        // Create session
        const session = this.sessionManager.create(player);
        player.setSessionToken(session.token);

        this.log(`玩家 ${name} (${player.id}) 登入成功, session: ${session.token}`);

        this._send(ws, {
            type: 'login_success',
            name: name,
            sessionToken: session.token,
            inQueue: false
        });

        this.broadcastSpectatorList();
    }

    _handleRestoreSession(ws, player, message) {
        const token = message.sessionToken;
        const session = this.sessionManager.restore(token);

        if (!session) {
            this._send(ws, { type: 'login_request' });
            return;
        }

        // Check name uniqueness
        const nameTaken = this.isNameTaken(session.name, ws);
        if (nameTaken) {
            this.sessionManager.delete(token);
            this._send(ws, { type: 'login_request' });
            return;
        }

        // Restore player
        player.setName(session.name);
        player.setStatus(session.status);
        player.setGameId(session.gameId);
        player.setSessionToken(token);

        this.log(`玩家 ${session.name} session 恢復成功`);

        const isInQueue = player.status === PlayerStatus.QUEUE;

        this._send(ws, {
            type: 'login_success',
            name: session.name,
            sessionToken: token,
            restored: true,
            inQueue: isInQueue
        });

        // Handle restored state
        if (player.status === PlayerStatus.QUEUE) {
            this.gameRoom.addToQueue(player);
        } else if (player.status === PlayerStatus.PLAYING && player.gameId) {
            const game = this.gameRoom.getGameById(player.gameId);
            if (game && game.isPlayer(ws)) {
                const playerIndex = game.getPlayerIndex(ws);
                const color = playerIndex === 0 ? Game.BLACK : Game.WHITE;
                const opponentIndex = 1 - playerIndex;

                this._send(ws, {
                    type: 'match_start',
                    playerColor: color,
                    opponentName: game.playerNames[opponentIndex],
                    board: game.board,
                    currentPlayer: game.currentPlayer === 0 ? Game.BLACK : Game.WHITE,
                    restored: true
                });

                // Restart timer
                game.startTimer(Game.TIMEOUT_MS, () => this.gameRoom.handleTimeout(game));
            } else {
                player.setStatus(PlayerStatus.WAITING);
                player.setGameId(null);
            }
        } else if (player.status === PlayerStatus.SPECTATING && player.gameId) {
            const game = this.gameRoom.getGameById(player.gameId);
            if (game) {
                game.addSpectator(ws);
                this._send(ws, {
                    type: 'spectate',
                    players: game.playerNames,
                    board: game.board,
                    currentPlayer: game.currentPlayer === 0 ? Game.BLACK : Game.WHITE,
                    restored: true
                });
            } else {
                player.setStatus(PlayerStatus.WAITING);
                player.setGameId(null);
            }
        } else {
            player.setStatus(PlayerStatus.WAITING);
            player.setGameId(null);
        }

        this.broadcastPlayerList();
        this.broadcastSpectatorList();
    }

    _handleMove(ws, player, message) {
        const game = this.gameRoom.getGameByPlayer(ws);
        if (!game || game.gameOver) return;

        const { row, col } = message;
        this.gameRoom.handleMove(game, ws, row, col);
    }

    _handleChat(ws, player, message) {
        const chatMsg = (message.message || '').trim().substring(0, 200);
        if (!chatMsg || !player.name) return;

        // Check cooldown
        const lastMsgTime = this.lastChatTime.get(ws) || 0;
        if (Date.now() - lastMsgTime < CHAT_COOLDOWN_MS) {
            this._send(ws, { type: 'error', message: '發送太快了，請稍後再試' });
            return;
        }
        this.lastChatTime.set(ws, Date.now());

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.broadcastToAll({
            type: 'chat_broadcast',
            time: timeStr,
            name: player.name,
            message: chatMsg,
            ip: player.ip
        });

        this.log(`[聊天] ${player.name} (${player.ip}): ${chatMsg}`);
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

    isNameTaken(name, excludeWs = null) {
        for (const [ws, player] of this.players) {
            if (ws !== excludeWs && player.name === name) {
                return true;
            }
        }
        return false;
    }

    // Broadcast methods
    _send(ws, message) {
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

    getAllPlayers() {
        return Array.from(this.players.values());
    }

    log(message) {
        console.log(message);
    }
}

module.exports = GameServer;