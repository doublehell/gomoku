const WebSocket = require('ws');
const Game = require('./Game');
const PlayerStatus = require('../enums/PlayerStatus');

class GameRoom {
    constructor(gameServer) {
        this.gameServer = gameServer;
        this.games = new Map(); // gameId -> Game
        this.matchmakingQueue = new Set(); // Set of Player
        this.gameIdCounter = 1;
        this.countdownTimer = null;
    }

    addToQueue(player) {
        if (player.status !== PlayerStatus.WAITING) return false;

        this.matchmakingQueue.add(player);
        player.setStatus(PlayerStatus.QUEUE);

        this.gameServer.broadcastQueueStatus();
        this.gameServer.broadcastPlayerList();
        this.gameServer.broadcastSpectatorList();

        this.gameServer.log(`玩家 ${player.name} 點擊參戰，當前排隊人數: ${this.matchmakingQueue.size}`);

        // Try to match
        this.findMatch();
        return true;
    }

    removeFromQueue(player) {
        if (player.status !== PlayerStatus.QUEUE) return false;

        this.matchmakingQueue.delete(player);
        player.setStatus(PlayerStatus.WAITING);

        this.gameServer.broadcastQueueStatus();
        this.gameServer.broadcastPlayerList();
        this.gameServer.broadcastSpectatorList();

        this.gameServer.log(`玩家 ${player.name} 取消參戰`);
        return true;
    }

    findMatch() {
        if (this.matchmakingQueue.size >= 2) {
            this.startMatch();
        }
    }

    startMatch() {
        // Randomly pick 2 players
        const queueArray = Array.from(this.matchmakingQueue);
        const indices = [];
        while (indices.length < 2) {
            const r = Math.floor(Math.random() * queueArray.length);
            if (!indices.includes(r)) indices.push(r);
        }

        // Sort to ensure lower index first
        indices.sort((a, b) => a - b);

        const player1 = queueArray[indices[0]];
        const player2 = queueArray[indices[1]];

        // Remove from queue
        this.matchmakingQueue.delete(player1);
        this.matchmakingQueue.delete(player2);

        // Create game
        this.createGame(player1, player2);
    }

    createGame(player1, player2) {
        const game = new Game(this.gameIdCounter++, player1, player2);

        player1.setStatus(PlayerStatus.PLAYING);
        player1.setGameId(game.id);
        player2.setStatus(PlayerStatus.PLAYING);
        player2.setGameId(game.id);

        this.games.set(game.id, game);

        this.gameServer.log(`遊戲 ${game.id} 開始: ${player1.name} vs ${player2.name}`);

        // Notify players
        player1.send({
            type: 'match_start',
            playerColor: Game.BLACK,
            opponentName: player2.name,
            board: game.board,
            currentPlayer: Game.BLACK
        });

        player2.send({
            type: 'match_start',
            playerColor: Game.WHITE,
            opponentName: player1.name,
            board: game.board,
            currentPlayer: Game.BLACK
        });

        // Notify others as spectators
        this.broadcastSpectator(game);

        // Broadcast status
        this.gameServer.broadcastQueueStatus();
        this.gameServer.broadcastPlayerList();
        this.gameServer.broadcastSpectatorList();

        // Start timer
        game.startTimer(Game.TIMEOUT_MS, () => this.handleTimeout(game));
    }

    broadcastSpectator(game) {
        const allPlayers = this.gameServer.getAllPlayers();

        allPlayers.forEach(player => {
            if (game.isPlayer(player.ws)) return;
            if (player.status === PlayerStatus.QUEUE) return;

            // Remove from queue if in queue
            this.matchmakingQueue.delete(player);

            player.setStatus(PlayerStatus.SPECTATING);
            player.setGameId(game.id);
            game.addSpectator(player.ws);

            player.send({
                type: 'spectate',
                players: game.playerNames,
                board: game.board,
                currentPlayer: game.currentPlayer === 0 ? Game.BLACK : Game.WHITE
            });
        });

        this.gameServer.broadcastQueueStatus();
        this.gameServer.broadcastPlayerList();
        this.gameServer.broadcastSpectatorList();
    }

    handleTimeout(game) {
        if (!game || game.gameOver) return;

        const loserIndex = game.currentPlayer;
        const winnerIndex = 1 - loserIndex;

        game.gameOver = true;
        game.stopTimer();

        const loser = game.players[loserIndex];
        const winner = game.players[winnerIndex];

        this.gameServer.log(`遊戲 ${game.id} 結束: ${loser.name} 超時判負，${winner.name} 獲勝`);

        // Notify players
        loser.send({
            type: 'timeout',
            winner: winnerIndex === 0 ? Game.BLACK : Game.WHITE,
            reason: '超時判負'
        });

        winner.send({
            type: 'win',
            winner: winnerIndex === 0 ? Game.BLACK : Game.WHITE
        });

        // Notify spectators
        game.spectators.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send({
                    type: 'game_end',
                    winner: winnerIndex === 0 ? Game.BLACK : Game.WHITE,
                    winnerName: game.playerNames[winnerIndex],
                    reason: `${game.playerNames[loserIndex]} 超時判負`
                });
            }
        });

        this.scheduleNextMatch(game);
    }

    endGame(game, winnerIndex, reason) {
        if (!game || game.gameOver) return;

        game.gameOver = true;
        game.stopTimer();

        const winner = game.players[winnerIndex];
        const loser = game.players[1 - winnerIndex];

        this.gameServer.log(`遊戲 ${game.id} 結束: ${winner.name} 獲勝 (${reason})`);

        // Notify players
        winner.send({
            type: 'win',
            winner: winnerIndex === 0 ? Game.BLACK : Game.WHITE
        });

        loser.send({
            type: 'lose',
            winner: winnerIndex === 0 ? Game.BLACK : Game.WHITE,
            reason: reason
        });

        // Notify spectators
        game.spectators.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send({
                    type: 'game_end',
                    winner: winnerIndex === 0 ? Game.BLACK : Game.WHITE,
                    winnerName: game.playerNames[winnerIndex],
                    reason: reason
                });
            }
        });

        this.scheduleNextMatch(game);
    }

    scheduleNextMatch(game) {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }

        // Set players back to waiting (spectator) status
        game.players.forEach(player => {
            if (player && player.ws) {
                player.setStatus(PlayerStatus.WAITING);
                player.setGameId(null);
            }
        });

        // Clear game
        this.games.delete(game.id);

        this.gameServer.broadcastQueueStatus();
        this.gameServer.broadcastPlayerList();
        this.gameServer.broadcastSpectatorList();

        // Notify players they are now in spectator mode
        game.players.forEach(player => {
            if (player && player.ws) {
                player.send({
                    type: 'spectate',
                    players: game.playerNames,
                    board: game.board,
                    currentPlayer: game.currentPlayer === 0 ? Game.BLACK : Game.WHITE
                });
            }
        });
    }

    handleMove(game, ws, row, col) {
        const result = game.placeMove(ws, row, col);

        if (!result.success) {
            return result;
        }

        // Restart timer
        game.startTimer(Game.TIMEOUT_MS, () => this.handleTimeout(game));

        // Broadcast move
        const message = {
            type: 'move',
            row: result.move.row,
            col: result.move.col,
            player: result.move.player
        };

        if (result.win) {
            message.type = 'win';
            message.winner = result.move.player;
            this.endGame(game, result.winnerIndex, '五子連珠');
        } else {
            message.currentPlayer = result.nextPlayer;
        }

        // Send to game participants
        this.gameServer.broadcastToGame(message, game);

        return result;
    }

    handlePlayerDisconnect(ws) {
        // Check if player was in queue
        for (const player of this.matchmakingQueue) {
            if (player.ws === ws) {
                this.matchmakingQueue.delete(player);
                this.gameServer.broadcastQueueStatus();
                break;
            }
        }

        // Check if player was in a game
        for (const [gameId, game] of this.games) {
            if (game.isPlayer(ws)) {
                const playerIndex = game.getPlayerIndex(ws);
                const winnerIndex = 1 - playerIndex;
                const winner = game.players[winnerIndex];

                game.gameOver = true;
                game.stopTimer();

                this.gameServer.log(`遊戲 ${game.id} 結束: ${game.playerNames[playerIndex]} 離開遊戲`);

                // Notify winner and set to spectator status
                if (winner && winner.ws && winner.ws.readyState === WebSocket.OPEN) {
                    winner.send({ type: 'opponent_left' });
                    winner.setStatus(PlayerStatus.WAITING);
                    winner.setGameId(null);
                }

                // Notify spectators
                game.spectators.forEach(spectatorWs => {
                    if (spectatorWs.readyState === WebSocket.OPEN) {
                        spectatorWs.send({
                            type: 'game_end',
                            winner: winnerIndex === 0 ? Game.BLACK : Game.WHITE,
                            winnerName: game.playerNames[winnerIndex],
                            reason: `${game.playerNames[playerIndex]} 離開遊戲`
                        });
                    }
                });

                // Remove game
                this.games.delete(gameId);

                this.gameServer.broadcastPlayerList();
                this.gameServer.broadcastSpectatorList();

                // Try to rematch
                this.findMatch();
                return;
            }

            // Check if spectator
            if (game.isSpectator(ws)) {
                game.removeSpectator(ws);
            }
        }
    }

    getGameById(gameId) {
        return this.games.get(gameId);
    }

    getGameByPlayer(ws) {
        for (const game of this.games.values()) {
            if (game.isPlayer(ws)) {
                return game;
            }
        }
        return null;
    }

    getQueueCount() {
        return this.matchmakingQueue.size;
    }

    getPlayerGameStatus(player) {
        // Check queue
        if (this.matchmakingQueue.has(player)) {
            return { status: PlayerStatus.QUEUE };
        }

        // Check games
        for (const [gameId, game] of this.games) {
            if (game.isPlayer(player.ws)) {
                return {
                    status: PlayerStatus.PLAYING,
                    gameId,
                    game
                };
            }
            if (game.isSpectator(player.ws)) {
                return {
                    status: PlayerStatus.SPECTATING,
                    gameId,
                    game
                };
            }
        }

        return { status: PlayerStatus.WAITING };
    }
}

module.exports = GameRoom;