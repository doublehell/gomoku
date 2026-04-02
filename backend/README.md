# Gobang Backend - 五子棋連線對戰伺服器

## 簡介

Node.js + WebSocket 即時連線對戰五子棋遊戲後端伺服器。

## 技術棧

- Node.js 20.x
- ws (WebSocket)
- 架構：OOP 類別設計

## 檔案結構

```
backend/
├── index.js              # 入口點
├── GameServer.js         # WebSocket 伺服器主類別
├── TimerManager.js       # 定時器管理
├── MessageHandler.js     # 訊息處理
├── models/
│   ├── Player.js         # 玩家類別
│   ├── Game.js           # 遊戲類別
│   ├── GameRoom.js       # 遊戲房間管理
│   ├── Session.js        # Session 類別
│   └── SessionManager.js # Session 管理
├── enums/
│   └── PlayerStatus.js   # 玩家狀態列舉
├── utils/
│   └── gameLogic.js      # 遊戲邏輯 (五子棋判斷)
└── package.json
```

## 快速開始

```bash
# 安裝依賴
cd backend
npm install

# 開發模式 (熱更新)
npm run dev

# 生產模式
npm start
```

## 執行環境

- 伺服器：http://localhost:3000
- WebSocket：ws://localhost:3000/ws
- 健康檢查：http://localhost:3000/health

## WebSocket API

### 客戶端發送 (Client → Server)

| Type | 說明 | 範例 |
|------|------|------|
| `login` | 登入 | `{ type: 'login', name: '玩家名' }` |
| `join_queue` | 加入排隊 | `{ type: 'join_queue' }` |
| `leave_queue` | 離開排隊 | `{ type: 'leave_queue' }` |
| `restore_session` | 恢復 session | `{ type: 'restore_session', sessionToken: 'xxx' }` |
| `move` | 下棋 | `{ type: 'move', row: 12, col: 12 }` |
| `chat` | 聊天 | `{ type: 'chat', message: 'Hello' }` |
| `get_user_info` | 取得用戶資訊 | `{ type: 'get_user_info' }` |

### 伺服器回應 (Server → Client)

| Type | 說明 |
|------|------|
| `login_request` | 要求登入 |
| `login_success` | 登入成功 |
| `lobby_state` | 大廳狀態 (waiting, spectators, players) |
| `match_start` | 遊戲開始 |
| `move` | 棋子移動 |
| `win` / `lose` | 遊戲結果 |
| `timeout` | 超時判負 |
| `opponent_left` | 對手離開 |
| `game_end` | 遊戲結束 |
| `chat_broadcast` | 聊天廣播 |
| `user_info` | 用戶資訊 |
| `error` | 錯誤訊息 |
| `time_sync` | 時間同步 |

## 玩家狀態

```
CONNECTED → WAITING → QUEUE → PLAYING
                ↑          ↓
            SPECTATING ←───┘
```

| 狀態 | 含義 |
|------|------|
| `CONNECTED` | 剛連線，未登入 |
| `WAITING` | 已登入，等待中 |
| `QUEUE` | 排隊中 |
| `PLAYING` | 遊戲中 |
| `SPECTATING` | 觀眾中 |

## 遊戲規則

- 棋盤：25 x 25
- 計時：60 秒
- 先手：黑棋 (BLACK)
- 勝利條件：五子連珠

## 機制說明

### Session 恢復

玩家登入後會產生 session token，儲存於 localStorage。斷線重連時自動恢復遊戲狀態。

### Heartbeat

伺服器每 30 秒發送 ping 偵測客戶端連線，無回應則斷開。

### 大廳狀態廣播

以下情況會廣播 `lobby_state`：
- 加入排隊
- 取消排隊
- 配對成功
- 遊戲結束

## 部署

```bash
# Docker
docker build -t gomoku-backend .
docker run -d -p 3000:3000 --name gomoku-backend gomoku-backend
```

## 環境變數

無需額外環境變數，預設 listen port 3000。