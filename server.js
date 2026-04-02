const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;

// 創建 HTTP 伺服器提供靜態文件
const server = http.createServer((req, res) => {
    // Health check for Kubernetes
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', players: wss.clients.size }));
        return;
    }

    let filePath = req.url === '/' ? '/gomoku-online.html' : req.url;
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
});

const wss = new WebSocket.Server({ server });

// 遊戲常數
const BOARD_SIZE = 25;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const TIMEOUT_MS = 60000; // 60秒
const COUNTDOWN_MS = 5000; // 5秒

// 所有連線的玩家
const players = new Map(); // ws -> { id, name, status, gameId, sessionToken }

// Session token 對應的客戶端資訊 (用於重新連線後恢復)
const sessions = new Map(); // sessionToken -> { name, status, gameId }

// 排隊中的玩家
const matchmakingQueue = []; // Array of ws

// 當前對戰
let currentGame = null;

// 定時器
let gameTimer = null;
let timeSyncTimer = null;
let countdownTimer = null;

// 遊戲 ID 計數器
let gameIdCounter = 1;

// 廣播給所有連線（包括觀眾）
function broadcastToAll(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// 廣播給特定遊戲的所有人（包括觀眾）
function broadcastToGame(message, game) {
    // 廣播給玩家
    if (game.players) {
        game.players.forEach(player => {
            if (player.readyState === WebSocket.OPEN) {
                player.send(JSON.stringify(message));
            }
        });
    }
    // 廣播給觀眾
    if (game.spectators) {
        game.spectators.forEach(spectator => {
            if (spectator.readyState === WebSocket.OPEN) {
                spectator.send(JSON.stringify(message));
            }
        });
    }
}

// 發送訊息給單一玩家
function sendTo(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

// 更新所有人數
function broadcastPlayerList() {
    const playerList = [];
    wss.clients.forEach(client => {
        const player = players.get(client);
        if (player && player.name) {
            let status = 'waiting';
            if (player.status === 'playing') {
                status = 'playing';
            } else if (player.status === 'spectating') {
                status = 'spectating';
            }
            playerList.push({ name: player.name, status });
        }
    });

    broadcastToAll({ type: 'player_list', players: playerList });
}

// 廣播排隊人數
function broadcastQueueStatus() {
    broadcastToAll({
        type: 'queue_status',
        count: matchmakingQueue.length
    });
}

// 添加玩家到排隊
function addToMatchmaking(ws) {
    const player = players.get(ws);
    if (!player || player.status !== 'waiting') return;

    // 檢查是否已在排隊中
    if (!matchmakingQueue.includes(ws)) {
        matchmakingQueue.push(ws);
    }
    player.status = 'queue';
    broadcastQueueStatus();
    broadcastPlayerList();

    console.log(`玩家 ${player.name} 加入排隊，當前排隊人數: ${matchmakingQueue.length}`);

    // 嘗試配對
    checkMatchmaking();
}

// 從排隊移除
function removeFromMatchmaking(ws) {
    const index = matchmakingQueue.indexOf(ws);
    if (index > -1) {
        matchmakingQueue.splice(index, 1);
    }
    broadcastQueueStatus();
}

// 檢查是否可以配對
function checkMatchmaking() {
    if (matchmakingQueue.length >= 2) {
        startMatch();
    }
}

// 隨機配對並開始遊戲
function startMatch() {
    // 隨機抽取2人
    const indices = [];
    while (indices.length < 2) {
        const r = Math.floor(Math.random() * matchmakingQueue.length);
        if (!indices.includes(r)) indices.push(r);
    }

    // 排序確保索引小的先
    indices.sort((a, b) => a - b);

    const player1 = matchmakingQueue[indices[0]];
    const player2 = matchmakingQueue[indices[1]];

    // 從排隊中移除
    matchmakingQueue.splice(indices[1], 1);
    matchmakingQueue.splice(indices[0], 1);

    // 取得玩家資料
    const p1 = players.get(player1);
    const p2 = players.get(player2);

    if (!p1 || !p2) return;

    // 建立遊戲
    const game = {
        id: gameIdCounter++,
        players: [player1, player2],
        playerNames: [p1.name, p2.name],
        spectators: [],
        board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY)),
        currentPlayer: 0, // 0 = 黑方(player1), 1 = 白方(player2)
        gameOver: false,
        lastMoveTime: Date.now(),
        timerId: null
    };

    currentGame = game;
    p1.status = 'playing';
    p1.gameId = game.id;
    p2.status = 'playing';
    p2.gameId = game.id;

    console.log(`遊戲 ${game.id} 開始: ${p1.name} vs ${p2.name}`);

    // 通知玩家
    sendTo(player1, {
        type: 'match_start',
        playerColor: BLACK,
        opponentName: p2.name,
        board: game.board,
        currentPlayer: BLACK
    });

    sendTo(player2, {
        type: 'match_start',
        playerColor: WHITE,
        opponentName: p1.name,
        board: game.board,
        currentPlayer: BLACK
    });

    // 通知其他玩家成為觀眾
    broadcastSpectator(game);

    // 廣播排隊狀態
    broadcastQueueStatus();
    broadcastPlayerList();

    // 啟動計時器
    startGameTimer();
}

// 通知其他人成為觀眾
function broadcastSpectator(game) {
    players.forEach((player, ws) => {
        if (game.players.includes(ws)) return;
        if (player.status === 'queue') return;

        // 從排隊中移除
        const idx = matchmakingQueue.indexOf(ws);
        if (idx > -1) {
            matchmakingQueue.splice(idx, 1);
        }

        player.status = 'spectating';
        player.gameId = game.id;

        // 添加到遊戲的觀眾列表
        if (!game.spectators.includes(ws)) {
            game.spectators.push(ws);
        }

        sendTo(ws, {
            type: 'spectate',
            players: game.playerNames,
            board: game.board,
            currentPlayer: game.currentPlayer === 0 ? BLACK : WHITE
        });
    });
    broadcastQueueStatus();
    broadcastPlayerList();
}

// 啟動遊戲計時器
function startGameTimer() {
    if (gameTimer) clearTimeout(gameTimer);
    if (timeSyncTimer) clearInterval(timeSyncTimer);

    // 60秒超時
    gameTimer = setTimeout(() => {
        handleTimeout();
    }, TIMEOUT_MS);

    // 每3秒同步時間
    timeSyncTimer = setInterval(() => {
        if (currentGame && !currentGame.gameOver) {
            const elapsed = Date.now() - currentGame.lastMoveTime;
            const remaining = Math.max(0, Math.ceil((TIMEOUT_MS - elapsed) / 1000));
            broadcastToGame({
                type: 'time_sync',
                remaining: remaining
            }, currentGame);
        }
    }, 3000);
}

// 處理超時
function handleTimeout() {
    if (!currentGame || currentGame.gameOver) return;

    const loserIndex = currentGame.currentPlayer;
    const winnerIndex = 1 - loserIndex;

    currentGame.gameOver = true;

    const loser = players.get(currentGame.players[loserIndex]);
    const winner = players.get(currentGame.players[winnerIndex]);

    console.log(`遊戲 ${currentGame.id} 結束: ${loser.name} 超時判負，${winner.name} 獲勝`);

    // 通知雙方
    sendTo(currentGame.players[loserIndex], {
        type: 'timeout',
        winner: winnerIndex === 0 ? BLACK : WHITE,
        reason: '超時判負'
    });

    sendTo(currentGame.players[winnerIndex], {
        type: 'win',
        winner: winnerIndex === 0 ? BLACK : WHITE
    });

    // 通知觀眾
    currentGame.spectators.forEach(spectator => {
        sendTo(spectator, {
            type: 'game_end',
            winner: winnerIndex === 0 ? BLACK : WHITE,
            winnerName: currentGame.playerNames[winnerIndex],
            reason: `${currentGame.playerNames[loserIndex]} 超時判負`
        });
    });

    // 停止計時器
    if (gameTimer) clearTimeout(gameTimer);
    if (timeSyncTimer) clearInterval(timeSyncTimer);

    // 5秒後重新配對
    scheduleNextMatch();
}

// 遊戲結束
function endGame(winnerIndex, reason) {
    if (!currentGame || currentGame.gameOver) return;

    currentGame.gameOver = true;

    const winner = players.get(currentGame.players[winnerIndex]);
    const loser = players.get(currentGame.players[1 - winnerIndex]);

    console.log(`遊戲 ${currentGame.id} 結束: ${winner.name} 獲勝 (${reason})`);

    // 通知玩家
    sendTo(currentGame.players[winnerIndex], {
        type: 'win',
        winner: winnerIndex === 0 ? BLACK : WHITE
    });

    sendTo(currentGame.players[1 - winnerIndex], {
        type: 'lose',
        winner: winnerIndex === 0 ? BLACK : WHITE,
        reason: reason
    });

    // 通知觀眾
    currentGame.spectators.forEach(spectator => {
        sendTo(spectator, {
            type: 'game_end',
            winner: winnerIndex === 0 ? BLACK : WHITE,
            winnerName: currentGame.playerNames[winnerIndex],
            reason: reason
        });
    });

    // 停止計時器
    if (gameTimer) clearTimeout(gameTimer);
    if (timeSyncTimer) clearInterval(timeSyncTimer);

    // 5秒後重新配對
    scheduleNextMatch();
}

// 5秒後重新配對
function scheduleNextMatch() {
    if (countdownTimer) clearTimeout(countdownTimer);

    let countdown = 5;
    const game = currentGame;

    broadcastToGame({ type: 'countdown', count: countdown }, game);

    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            broadcastToGame({ type: 'countdown', count: countdown }, game);
        } else {
            clearInterval(countdownTimer);
            countdownTimer = null;

            // 從觀眾中隨機抓2人
            const spectators = game.spectators.filter(s => s.readyState === WebSocket.OPEN);

            if (spectators.length >= 2) {
                // 隨機抽取2個觀眾成為玩家
                const indices = [];
                while (indices.length < 2) {
                    const r = Math.floor(Math.random() * spectators.length);
                    if (!indices.includes(r)) indices.push(r);
                }

                // 重新配對
                const newPlayer1 = spectators[indices[0]];
                const newPlayer2 = spectators[indices[1]];

                const p1 = players.get(newPlayer1);
                const p2 = players.get(newPlayer2);

                // 從原遊戲移除
                game.spectators = game.spectators.filter(s => !indices.includes(game.spectators.indexOf(s)));

                // 加入新排隊
                matchmakingQueue.push(newPlayer1);
                matchmakingQueue.push(newPlayer2);
            }

            // 清理當前遊戲
            currentGame = null;

            // 嘗試配對
            checkMatchmaking();
        }
    }, 1000);
}

// 檢查勝利
function checkWin(board, row, col, player) {
    const directions = [
        [[0, 1], [0, -1]],
        [[1, 0], [-1, 0]],
        [[1, 1], [-1, -1]],
        [[1, -1], [-1, 1]]
    ];

    for (const [dir1, dir2] of directions) {
        let count = 1;

        for (let i = 1; i < 5; i++) {
            const newRow = row + dir1[0] * i;
            const newCol = col + dir1[1] * i;
            if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE && board[newRow][newCol] === player) {
                count++;
            } else break;
        }

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

// 生成 session token
function generateSessionToken() {
    return 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

// WebSocket 連接處理
wss.on('connection', (ws) => {
    const playerId = Date.now() + Math.random();

    // 初始玩家狀態
    players.set(ws, {
        id: playerId,
        name: null,
        status: 'connected', // connected, waiting, queue, playing, spectating
        gameId: null,
        sessionToken: null
    });

    console.log(`玩家 ${playerId} 連線`);

    // 檢查 client 是否有 session token
    // 如果有，嘗試恢復 session
    // 但首先發送 login_request，讓 client 決定是否要恢復或重新登入
    sendTo(ws, { type: 'login_request' });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            const player = players.get(ws);

            switch (message.type) {
                case 'login':
                    // 玩家登入
                    const name = (message.name || '').trim().substring(0, 20);
                    if (name.length < 2) {
                        sendTo(ws, { type: 'error', message: '暱稱需要2-20個字' });
                        return;
                    }

                    // 檢查暱稱是否已被使用
                    let nameTaken = false;
                    players.forEach((p, client) => {
                        if (client !== ws && p.name === name) {
                            nameTaken = true;
                        }
                    });

                    if (nameTaken) {
                        sendTo(ws, { type: 'error', message: '此暱稱已被使用' });
                        return;
                    }

                    player.name = name;
                    player.status = 'waiting';

                    // 生成 session token
                    const sessionToken = generateSessionToken();
                    player.sessionToken = sessionToken;

                    // 儲存 session
                    sessions.set(sessionToken, {
                        name: name,
                        status: 'waiting',
                        gameId: null
                    });

                    console.log(`玩家 ${name} (${playerId}) 登入成功, session: ${sessionToken}`);

                    sendTo(ws, {
                        type: 'login_success',
                        name: name,
                        sessionToken: sessionToken
                    });

                    // 自動加入排隊
                    addToMatchmaking(ws);
                    break;

                case 'restore_session':
                    // 嘗試恢復 session
                    const token = message.sessionToken;
                    const session = sessions.get(token);

                    if (!session) {
                        sendTo(ws, { type: 'login_request' });
                        return;
                    }

                    // 檢查暱稱是否已被使用
                    let restoreNameTaken = false;
                    players.forEach((p, client) => {
                        if (client !== ws && p.name === session.name) {
                            restoreNameTaken = true;
                        }
                    });

                    if (restoreNameTaken) {
                        // session 已被佔用，需要重新登入
                        sessions.delete(token);
                        sendTo(ws, { type: 'login_request' });
                        return;
                    }

                    // 恢復 session
                    player.name = session.name;
                    player.status = session.status;
                    player.gameId = session.gameId;
                    player.sessionToken = token;

                    console.log(`玩家 ${session.name} session 恢復成功`);

                    sendTo(ws, {
                        type: 'login_success',
                        name: session.name,
                        sessionToken: token,
                        restored: true
                    });

                    // 如果在排隊中，加入排隊
                    if (player.status === 'queue') {
                        addToMatchmaking(ws);
                    } else if (player.status === 'playing' && currentGame && currentGame.id === player.gameId) {
                        // 恢復遊戲狀態
                        const playerIndex = currentGame.players.indexOf(ws);
                        if (playerIndex === -1) {
                            // 玩家不在遊戲中，重新加入
                            // 這是特殊情況，讓玩家重新排隊
                            player.status = 'waiting';
                            addToMatchmaking(ws);
                        } else {
                            // 通知玩家恢復遊戲
                            const color = playerIndex === 0 ? BLACK : WHITE;
                            const opponentIndex = 1 - playerIndex;
                            sendTo(ws, {
                                type: 'match_start',
                                playerColor: color,
                                opponentName: currentGame.playerNames[opponentIndex],
                                board: currentGame.board,
                                currentPlayer: currentGame.currentPlayer === 0 ? BLACK : WHITE,
                                restored: true
                            });
                            // 恢復計時器
                            startGameTimer();
                        }
                    } else if (player.status === 'spectating' && currentGame && currentGame.id === player.gameId) {
                        // 恢復觀眾狀態
                        if (!currentGame.spectators.includes(ws)) {
                            currentGame.spectators.push(ws);
                        }
                        sendTo(ws, {
                            type: 'spectate',
                            players: currentGame.playerNames,
                            board: currentGame.board,
                            currentPlayer: currentGame.currentPlayer === 0 ? BLACK : WHITE,
                            restored: true
                        });
                    } else {
                        // 沒有遊戲狀態，加入排隊
                        player.status = 'waiting';
                        addToMatchmaking(ws);
                    }

                    // 廣播更新
                    broadcastPlayerList();
                    break;

                case 'move':
                    // 玩家移動
                    if (!currentGame || currentGame.gameOver) return;
                    if (!currentGame.players.includes(ws)) return;

                    const playerIndex = currentGame.players.indexOf(ws);
                    const currentIndex = currentGame.currentPlayer;

                    // 檢查是否輪到該玩家
                    if (playerIndex !== currentIndex) return;

                    const { row, col } = message;
                    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
                    if (currentGame.board[row][col] !== EMPTY) return;

                    // 更新棋盤
                    const playerColor = playerIndex === 0 ? BLACK : WHITE;
                    currentGame.board[row][col] = playerColor;

                    // 更新最後移動時間
                    currentGame.lastMoveTime = Date.now();

                    // 重置計時器
                    startGameTimer();

                    // 廣播移動
                    const nextPlayer = 1 - currentIndex;
                    const nextColor = nextPlayer === 0 ? BLACK : WHITE;

                    broadcastToGame({
                        type: 'move',
                        row: row,
                        col: col,
                        player: playerColor,
                        currentPlayer: nextColor
                    }, currentGame);

                    // 檢查勝利
                    if (checkWin(currentGame.board, row, col, playerColor)) {
                        endGame(playerIndex, '五子連珠');
                    } else {
                        currentGame.currentPlayer = nextPlayer;
                    }
                    break;

                case 'chat':
                    // 聊天訊息
                    const chatMsg = (message.message || '').trim().substring(0, 200);
                    if (!chatMsg || !player.name) return;

                    const now = new Date();
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

                    broadcastToAll({
                        type: 'chat_broadcast',
                        time: timeStr,
                        name: player.name,
                        message: chatMsg
                    });
                    break;
            }
        } catch (e) {
            console.error('處理訊息錯誤:', e);
        }
    });

    ws.on('close', () => {
        const player = players.get(ws);
        if (!player) return;

        console.log(`玩家 ${player.name || player.id} 離線`);

        // 從排隊移除
        removeFromMatchmaking(ws);

        // 如果正在遊戲中
        if (currentGame && currentGame.players.includes(ws)) {
            const playerIndex = currentGame.players.indexOf(ws);
            const winnerIndex = 1 - playerIndex;

            currentGame.gameOver = true;

            // 通知對手
            if (currentGame.players[winnerIndex].readyState === WebSocket.OPEN) {
                sendTo(currentGame.players[winnerIndex], {
                    type: 'opponent_left'
                });
            }

            // 通知觀眾
            broadcastToGame({
                type: 'game_end',
                winner: winnerIndex === 0 ? BLACK : WHITE,
                winnerName: currentGame.playerNames[winnerIndex],
                reason: `${player.name} 離開遊戲`
            }, currentGame);

            // 停止計時器
            if (gameTimer) clearTimeout(gameTimer);
            if (timeSyncTimer) clearInterval(timeSyncTimer);

            currentGame = null;

            // 嘗試重新配對
            checkMatchmaking();
        } else if (currentGame && currentGame.spectators && currentGame.spectators.includes(ws)) {
            // 從觀眾移除
            const idx = currentGame.spectators.indexOf(ws);
            if (idx > -1) {
                currentGame.spectators.splice(idx, 1);
            }
        }

        // 移除玩家
        players.delete(ws);

        // 更新玩家列表
        broadcastPlayerList();
    });
});

server.listen(PORT, () => {
    console.log(`伺服器運行於 http://localhost:${PORT}`);
    console.log(`開啟瀏覽器訪問 http://localhost:${PORT}/gomoku-online.html`);
});