const PlayerStatus = require('./enums/PlayerStatus');
const Game = require('./models/Game');
const { sanitizeHtml } = require('./utils/sanitize');
const { BOARD_SIZE } = require('./utils/gameLogic');

/**
 * Handles all WebSocket message processing
 * Single Responsibility: Message handling logic
 */
class MessageHandler {
    constructor(gameServer, gameRoom, sessionManager) {
        this.gameServer = gameServer;
        this.gameRoom = gameRoom;
        this.sessionManager = sessionManager;
    }

    /**
     * Process incoming message from client
     * @param {WebSocket} ws - Client WebSocket
     * @param {Object} message - Parsed message
     */
    handle(ws, message) {
        const player = this.gameServer.players.get(ws);
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
            case 'get_user_info':
                this._handleGetUserInfo(ws, player);
                break;
            default:
                this.gameServer.log(`未知訊息類型: ${message.type}`);
        }
    }

    _handleLogin(ws, player, message) {
        const rawName = (message.name || '').trim().substring(0, 20);
        const name = sanitizeHtml(rawName);

        if (name.length < 2) {
            this.gameServer.send(ws, { type: 'error', message: '暱稱需要2-20個字' });
            return;
        }

        if (this.gameServer.isNameTaken(name, ws)) {
            this.gameServer.send(ws, { type: 'error', message: '此暱稱已被使用' });
            return;
        }

        player.setName(name);
        player.setStatus(PlayerStatus.SPECTATING);

        const session = this.sessionManager.create(player);
        player.setSessionToken(session.token);

        // Sync initial status to session
        this.sessionManager.updatePlayerStatus(player, player.status);

        this.gameServer.log(`玩家 ${name} (${player.id}) 登入成功, session: ${session.token}`);

        this.gameServer.send(ws, {
            type: 'login_success',
            name: name,
            sessionToken: session.token,
            inQueue: false
        });

        // 發送大廳狀態
        this._sendLobbyState(ws);

        this.gameServer.broadcastSpectatorList();
    }

    _handleRestoreSession(ws, player, message) {
        const token = message.sessionToken;
        const session = this.sessionManager.restore(token);

        if (!session) {
            this.gameServer.send(ws, { type: 'login_request' });
            return;
        }

        if (this.gameServer.isNameTaken(session.name, ws)) {
            this.sessionManager.delete(token);
            this.gameServer.send(ws, { type: 'login_request' });
            return;
        }

        player.setName(session.name);
        player.setStatus(session.status);
        player.setGameId(session.gameId);
        player.setSessionToken(token);

        this.gameServer.log(`玩家 ${session.name} session 恢復成功`);

        const isInQueue = player.status === PlayerStatus.QUEUE;

        this.gameServer.send(ws, {
            type: 'login_success',
            name: session.name,
            sessionToken: token,
            restored: true,
            inQueue: isInQueue
        });

        if (player.status === PlayerStatus.QUEUE) {
            this.gameRoom.addToQueue(player);
        } else if (player.status === PlayerStatus.PLAYING && player.gameId) {
            this._restoreGameState(ws, player);
        } else if (player.status === PlayerStatus.SPECTATING && player.gameId) {
            this._restoreSpectatorState(ws, player);
        } else {
            player.setStatus(PlayerStatus.SPECTATING);
            player.setGameId(null);
        }

        // 發送大廳狀態
        this._sendLobbyState(ws);

        this.gameServer.broadcastPlayerList();
        this.gameServer.broadcastSpectatorList();
    }

    _restoreGameState(ws, player) {
        const game = this.gameRoom.getGameById(player.gameId);
        if (game && game.isPlayer(ws)) {
            const playerIndex = game.getPlayerIndex(ws);
            const color = playerIndex === 0 ? Game.BLACK : Game.WHITE;
            const opponentIndex = 1 - playerIndex;

            this.gameServer.send(ws, {
                type: 'match_start',
                playerColor: color,
                opponentName: game.playerNames[opponentIndex],
                board: game.board,
                currentPlayer: game.currentPlayer === 0 ? Game.BLACK : Game.WHITE,
                restored: true
            });

            game.startTimer(Game.TIMEOUT_MS, () => this.gameRoom.handleTimeout(game));
        } else {
            player.setStatus(PlayerStatus.SPECTATING);
            player.setGameId(null);
        }
    }

    _restoreSpectatorState(ws, player) {
        const game = this.gameRoom.getGameById(player.gameId);
        if (game) {
            game.addSpectator(ws);
            this.gameServer.send(ws, {
                type: 'spectate',
                players: game.playerNames,
                board: game.board,
                currentPlayer: game.currentPlayer === 0 ? Game.BLACK : Game.WHITE,
                restored: true
            });
        } else {
            player.setStatus(PlayerStatus.SPECTATING);
            player.setGameId(null);
        }
    }

    _handleMove(ws, player, message) {
        const game = this.gameRoom.getGameByPlayer(ws);
        if (!game || game.gameOver) return;

        const row = message.row;
        const col = message.col;

        // Validate coordinate types
        if (!Number.isInteger(row) || !Number.isInteger(col)) {
            this.gameServer.send(ws, { type: 'error', message: '無效的座標格式' });
            return;
        }

        // Validate coordinate range
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            this.gameServer.send(ws, { type: 'error', message: '座標超出棋盤範圍' });
            return;
        }

        this.gameRoom.handleMove(game, ws, row, col);
    }

    _handleChat(ws, player, message) {
        const rawMsg = (message.message || '').trim().substring(0, 200);
        const chatMsg = sanitizeHtml(rawMsg);
        if (!chatMsg || !player.name) return;

        const lastMsgTime = this.gameServer.lastChatTime.get(ws) || 0;
        if (Date.now() - lastMsgTime < 1000) {
            this.gameServer.send(ws, { type: 'error', message: '發送太快了，請稍後再試' });
            return;
        }
        this.gameServer.lastChatTime.set(ws, Date.now());

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        this.gameServer.broadcastToAll({
            type: 'chat_broadcast',
            time: timeStr,
            name: player.name,
            message: chatMsg
        });

        this.gameServer.log(`[聊天] ${player.name}: ${chatMsg}`);
    }

    _handleGetUserInfo(ws, player) {
        if (!player.name) {
            this.gameServer.send(ws, { type: 'error', message: '請先登入' });
            return;
        }

        this.gameServer.send(ws, {
            type: 'user_info',
            name: player.name,
            loginTime: player.loginTime,
            status: player.status
        });
    }

    /**
     * 發送大廳狀態給客戶端
     */
    _sendLobbyState(ws) {
        const waiting = [];
        const spectators = [];
        const players = [];

        for (const [, player] of this.gameServer.players) {
            if (!player.name) continue;

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
        }

        this.gameServer.send(ws, {
            type: 'lobby_state',
            waiting,
            spectators,
            players
        });
    }
}

module.exports = MessageHandler;