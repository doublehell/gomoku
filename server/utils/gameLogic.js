// Game constants
const BOARD_SIZE = 25;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

/**
 * Check if there's a win at the given position
 * @param {number[][]} board - 2D array representing the board
 * @param {number} row - Row of the last move
 * @param {number} col - Column of the last move
 * @param {number} player - Player color (BLACK or WHITE)
 * @returns {boolean} - True if the player has won
 */
function checkWin(board, row, col, player) {
    const directions = [
        [[0, 1], [0, -1]],   // Horizontal
        [[1, 0], [-1, 0]],   // Vertical
        [[1, 1], [-1, -1]],  // Diagonal \
        [[1, -1], [-1, 1]]   // Diagonal /
    ];

    for (const [dir1, dir2] of directions) {
        let count = 1;

        // Count in positive direction
        for (let i = 1; i < 5; i++) {
            const newRow = row + dir1[0] * i;
            const newCol = col + dir1[1] * i;
            if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE && board[newRow][newCol] === player) {
                count++;
            } else break;
        }

        // Count in negative direction
        for (let i = 1; i < 5; i++) {
            const newRow = row + dir2[0] * i;
            const newCol = col + dir2[1] * i;
            if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE && board[newRow][newCol] === player) {
                count++;
            } else break;
        }

        if (count >= 5) return true;
    }
    return false;
}

/**
 * Generate a session token
 * @returns {string} - Session token
 */
function generateSessionToken() {
    return 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

/**
 * Create an empty board
 * @returns {number[][]} - 2D array filled with EMPTY
 */
function createEmptyBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
}

module.exports = {
    BOARD_SIZE,
    EMPTY,
    BLACK,
    WHITE,
    checkWin,
    generateSessionToken,
    createEmptyBoard
};