const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;

// Session 過期時間 (5分鐘)
const SESSION_EXPIRY_MS = 5 * 60 * 1000;

// 聊天冷卻時間 (1秒)
const CHAT_COOLDOWN_MS = 1000;

// 追蹤每個客戶端的 last chat time
const lastChatTime = new Map(); // ws -> timestamp

// Session 過期清理定時器
setInterval(() => {
    const now = Date.now();
    sessions.forEach((session, token) => {
        if (session.expiresAt && now > session.expiresAt) {
            sessions.delete(token);
            console.log(`Session ${token} 過期清除`);
        }
    });
}, 60000); // 每分鐘檢查一次

// 創建 HTTP 伺服器提供靜態文件
const server = http.createServer((req, res) => {
    // Health check for Kubernetes
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', players: wss.clients.size }));
        return;
    }

    // Path Traversal 防護: 驗證 URL 路徑
    let urlPath = req.url.split('?')[0]; // 移除 query string
    urlPath = decodeURIComponent(urlPath);

    // 禁止 ../ 路徑穿越
    if (urlPath.includes('..')) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // 限制只能存取允許的目錄
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

// 更新 player 狀態時同步更新 session
function updatePlayerStatus(ws, newStatus, newGameId = null) {
    const player = players.get(ws);
    if (!player) return;

    player.status = newStatus;
    if (newGameId !== null) {
        player.gameId = newGameId;
    }

    // 同步更新 session
    if (player.sessionToken) {
        const session = sessions.get(player.sessionToken);
        if (session) {
            session.status = newStatus;
            session.gameId = newGameId;
        }
    }
}

// 廣播觀眾名單
function broadcastSpectatorList() {
    // 观众区显示: waiting (未按参战) + 真正观眾 (spectating)
    // 不显示正在对战的玩家（他们显示在玩家列表）
    const spectatorNames = [];
    const waitingNames = [];

    wss.clients.forEach(client => {
        const player = players.get(client);
        if (player && player.name) {
            if (player.status === 'waiting') {
                waitingNames.push(player.name);
            } else if (player.status === 'spectating') {
                spectatorNames.push(player.name);
            }
        }
    });

    broadcastToAll({
        type: 'spectator_list',
        spectators: spectatorNames,
        waiting: waitingNames
    });
}

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
            // 只显示 queue/playing 状态的玩家（已按下参战）
            // waiting/spectating 不显示在玩家列表，会显示在观众区
            if (player.status === 'waiting' || player.status === 'spectating') return;

            let status = player.status; // queue, playing
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

// 添加玩家到排隊 (手動點擊參戰)
function addToMatchmaking(ws) {
    const player = players.get(ws);
    if (!player || player.status !== 'waiting') return;

    // 檢查是否已在排隊中
    if (!matchmakingQueue.includes(ws)) {
        matchmakingQueue.push(ws);
    }
    updatePlayerStatus(ws, 'queue');
    broadcastQueueStatus();
    broadcastPlayerList();
    broadcastSpectatorList();

    console.log(`玩家 ${player.name} 點擊參戰，當前排隊人數: ${matchmakingQueue.length}`);

    // 嘗試配對
    checkMatchmaking();
}

// 玩家取消參戰
function leaveMatchmaking(ws) {
    const player = players.get(ws);
    if (!player || player.status !== 'queue') return;

    removeFromMatchmaking(ws);
    updatePlayerStatus(ws, 'waiting');
    broadcastPlayerList();
    broadcastSpectatorList();

    console.log(`玩家 ${player.name} 取消參戰`);
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
    updatePlayerStatus(player1, 'playing', game.id);
    updatePlayerStatus(player2, 'playing', game.id);

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
    broadcastSpectatorList();

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

        updatePlayerStatus(ws, 'spectating', game.id);

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
    broadcastSpectatorList();
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

// 遊戲結束後重新配對
function scheduleNextMatch() {
    if (countdownTimer) clearInterval(countdownTimer);

    const game = currentGame;

    // 遊戲結束後，將玩家加入排隊（自動進入下一輪配對）
    if (game && game.players) {
        game.players.forEach(p => {
            const player = players.get(p);
            if (player) {
                // 維持排隊狀態，等待自動配對
                if (!matchmakingQueue.includes(p)) {
                    matchmakingQueue.push(p);
                }
                updatePlayerStatus(p, 'queue', null);
            }
        });
    }

    // 廣播遊戲結束，清理遊戲
    currentGame = null;
    broadcastPlayerList();
    broadcastSpectatorList();

    // 檢查是否有足夠人數參戰
    if (matchmakingQueue.length >= 2) {
        // 有足夠人數，開始倒數
        let countdown = 5;

        broadcastToAll({ type: 'countdown', count: countdown });

        countdownTimer = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                broadcastToAll({ type: 'countdown', count: countdown });
            } else {
                clearInterval(countdownTimer);
                countdownTimer = null;
                checkMatchmaking();
            }
        }, 1000);
    } else {
        // 人數不足，廣播等待
        broadcastToAll({
            type: 'match_waiting',
            message: matchmakingQueue.length > 0
                ? `等待更多玩家參戰... (${matchmakingQueue.length}/2)`
                : '請點擊「我要參戰」按鈕開始配對'
        });
    }
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
wss.on('connection', (ws, req) => {
    const playerId = Date.now() + Math.random();

    // 取得客戶端 IP (支援 Proxy/Load Balancer)
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';

    // 初始玩家狀態
    players.set(ws, {
        id: playerId,
        name: null,
        status: 'connected', // connected, waiting, queue, playing, spectating
        gameId: null,
        sessionToken: null,
        ip: clientIP
    });

    console.log(`玩家 ${playerId} 連線, IP: ${clientIP}`);

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
                    updatePlayerStatus(ws, 'waiting');

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

                    // 更新觀眾列表
                    broadcastSpectatorList();
                    break;

                case 'join_queue':
                    // 玩家點擊參戰
                    addToMatchmaking(ws);
                    break;

                case 'leave_queue':
                    // 玩家取消參戰
                    leaveMatchmaking(ws);
                    break;

                case 'restore_session':
                    // 嘗試恢復 session
                    const token = message.sessionToken;
                    const session = sessions.get(token);

                    if (!session) {
                        sendTo(ws, { type: 'login_request' });
                        return;
                    }

                    // 檢查 session 是否過期
                    if (session.expiresAt && Date.now() > session.expiresAt) {
                        sessions.delete(token);
                        sendTo(ws, { type: 'login_request' });
                        return;
                    }

                    // 清除過期時間，恢復 active session
                    delete session.expiresAt;

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
                            // 玩家不在遊戲中，維持等待狀態讓玩家手動參戰
                            player.status = 'waiting';
                            player.gameId = null;
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
                        // 沒有遊戲狀態，維持等待狀態讓玩家手動參戰
                        player.status = 'waiting';
                        player.gameId = null;
                    }

                    // 廣播更新
                    broadcastPlayerList();
                    broadcastSpectatorList();
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
                    // 聊天訊息 (含頻率限制)
                    const chatMsg = (message.message || '').trim().substring(0, 200);
                    if (!chatMsg || !player.name) return;

                    // 檢查冷卻時間
                    const lastMsgTime = lastChatTime.get(ws) || 0;
                    if (Date.now() - lastMsgTime < CHAT_COOLDOWN_MS) {
                        sendTo(ws, { type: 'error', message: '發送太快了，請稍後再試' });
                        return;
                    }
                    lastChatTime.set(ws, Date.now());

                    const now = new Date();
                    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

                    // 廣播聊天訊息給所有人 (包含發送者 IP)
                    broadcastToAll({
                        type: 'chat_broadcast',
                        time: timeStr,
                        name: player.name,
                        message: chatMsg,
                        ip: player.ip  // 供管理後台查看
                    });

                    // 同時輸出到 server console
                    console.log(`[聊天] ${player.name} (${player.ip}): ${chatMsg}`);
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

                // 獲勝的玩家維持排隊狀態
                const winnerWs = currentGame.players[winnerIndex];
                if (!matchmakingQueue.includes(winnerWs)) {
                    matchmakingQueue.push(winnerWs);
                }
                updatePlayerStatus(winnerWs, 'queue', null);
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

            // 廣播更新
            broadcastPlayerList();
            broadcastSpectatorList();

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

        // 清理 lastChatTime
        lastChatTime.delete(ws);

        // Session 記憶體洩漏修復: 設置過期時間而非立即刪除
        // 保留 5 分鐘讓使用者可以重新整理頁面
        if (player.sessionToken) {
            const session = sessions.get(player.sessionToken);
            if (session) {
                session.expiresAt = Date.now() + SESSION_EXPIRY_MS;
                console.log(`玩家 ${player.name} session 設置 ${SESSION_EXPIRY_MS / 60000} 分鐘後過期`);
            }
        }

        // 更新玩家列表
        broadcastPlayerList();
        broadcastSpectatorList();
    });
});

server.listen(PORT, () => {
    console.log(`伺服器運行於 http://localhost:${PORT}`);
    console.log(`開啟瀏覽器訪問 http://localhost:${PORT}/gomoku-online.html`);
});