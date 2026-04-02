const { checkWin, BOARD_SIZE, EMPTY, BLACK, WHITE } = require('../utils/gameLogic');

class Game {
    constructor(id, player1, player2) {
        this.id = id;
        this.players = [player1, player2]; // [Player, Player]
        this.playerNames = [player1.name, player2.name];
        this.spectators = new Set();
        this.board = this._createBoard();
        this.currentPlayer = 0; // 0 = black (player1), 1 = white (player2)
        this.gameOver = false;
        this.lastMoveTime = Date.now();
        this.gameTimer = null;
        this.timeSyncTimer = null;
        this.countdownTimer = null;
        this.onTimeout = null; // Callback for timeout
    }

    _createBoard() {
        return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
    }

    getPlayerIndex(ws) {
        return this.players.findIndex(p => p && p.ws === ws);
    }

    isPlayer(ws) {
        return this.players.some(p => p && p.ws === ws);
    }

    isSpectator(ws) {
        return this.spectators.has(ws);
    }

    addSpectator(ws) {
        this.spectators.add(ws);
    }

    removeSpectator(ws) {
        this.spectators.delete(ws);
    }

    placeMove(ws, row, col) {
        const playerIndex = this.getPlayerIndex(ws);

        // Check if it's this player's turn
        if (playerIndex !== this.currentPlayer) {
            return { success: false, reason: 'not_your_turn' };
        }

        // Check bounds
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            return { success: false, reason: 'out_of_bounds' };
        }

        // Check if cell is empty
        if (this.board[row][col] !== EMPTY) {
            return { success: false, reason: 'cell_occupied' };
        }

        // Place the move
        const playerColor = playerIndex === 0 ? BLACK : WHITE;
        this.board[row][col] = playerColor;
        this.lastMoveTime = Date.now();

        // Check for win
        if (checkWin(this.board, row, col, playerColor)) {
            return {
                success: true,
                move: { row, col, player: playerColor },
                win: true,
                winnerIndex: playerIndex
            };
        }

        // Switch player
        this.currentPlayer = 1 - this.currentPlayer;

        return {
            success: true,
            move: { row, col, player: playerColor },
            win: false,
            nextPlayer: this.currentPlayer === 0 ? BLACK : WHITE
        };
    }

    startTimer(timeoutMs, onTimeout) {
        this.stopTimer();
        this.onTimeout = onTimeout;

        this.gameTimer = setTimeout(() => {
            if (this.onTimeout) {
                this.onTimeout();
            }
        }, timeoutMs);

        // Note: Time sync is handled by external gameServer via getRemainingTime()
    }

    // Get remaining time for sync (called by external timer)
    syncTime(timeoutMs) {
        return this.getRemainingTime(timeoutMs);
    }

    stopTimer() {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            this.gameTimer = null;
        }
        if (this.timeSyncTimer) {
            clearInterval(this.timeSyncTimer);
            this.timeSyncTimer = null;
        }
    }

    getRemainingTime(timeoutMs) {
        const elapsed = Date.now() - this.lastMoveTime;
        return Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
    }

    setCurrentPlayer(index) {
        this.currentPlayer = index;
    }

    toJSON() {
        return {
            id: this.id,
            playerNames: this.playerNames,
            board: this.board,
            currentPlayer: this.currentPlayer === 0 ? BLACK : WHITE,
            gameOver: this.gameOver
        };
    }
}

// Constants for external use
Game.BOARD_SIZE = BOARD_SIZE;
Game.EMPTY = EMPTY;
Game.BLACK = BLACK;
Game.WHITE = WHITE;
Game.TIMEOUT_MS = 60000;
Game.COUNTDOWN_MS = 5000;

module.exports = Game;