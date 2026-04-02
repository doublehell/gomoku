# Gobang Online - 五子棋連線對戰

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![Vue](https://img.shields.io/badge/Vue-3.x-green.svg)

即時連線對戰五子棋遊戲，支援自動配對、觀眾模式、計時系統和即時聊天。

## 功能特色

- 🎮 **手動參戰** - 點擊「我要參戰」按鈕開始配對
- 👀 **觀眾模式** - 未參戰的玩家自動成為觀眾，即時觀戰
- ⏱️ **計時系統** - 60秒未下棋自動判負
- 💬 **即時聊天** - 全服玩家即時聊天 (含頻率限制)
- 🔄 **Session 保持** - 重新整理維持登入狀態
- 🐳 **Docker 支援** - 一鍵部署至 Docker
- 🔒 **資安防護** - XSS 防護、Path Traversal 防護、IP 記錄

## 快速開始

### 前後端分開執行

```bash
# 後端
cd backend
npm install
npm run dev   # 開發模式 (熱更新)
# 或 npm start

# 前端 (新開終端機)
cd frontend
npm install
npm run dev
```

### Docker

```bash
# 後端
cd backend
docker build -t gomoku-backend .
docker run -d -p 3000:3000 --name gomoku-backend gomoku-backend

# 前端
cd frontend
docker build -t gomoku-frontend .
docker run -d -p 8080:80 --name gomoku-frontend gomoku-frontend
```

## 訪問

- 前端：http://localhost:8080
- 後端 WebSocket：ws://localhost:3000/ws
- 後端 Health Check：http://localhost:3000/health

## 遊戲說明

1. 開啟網頁，輸入暱稱 (2-20字)
2. 點擊「我要參戰」按鈕
3. 湊滿2人後自動配對
4. 對戰開始，五子連珠獲勝
5. 遊戲結束後雙方成為觀眾

## 架構設計

```
┌────────────────────┐          ┌────────────────────┐
│   Frontend (Vue 3) │          │ Backend (Node.js)  │
│   http://:8080     │◄────────►│ ws://:3000/ws      │
│                    │  WebSocket          │
│  ┌──────────────┐  │          ┌──────────────┐   │
│  │ 登入         │  │          │ 配對系統      │   │
│  │ 大廳         │  │          │ 遊戲邏輯      │   │
│  │ 棋盤         │  │          │ 計時器        │   │
│  │ 聊天室       │  │          │ Session 管理  │   │
│  └──────────────┘  │          └──────────────┘   │
└────────────────────┘          └────────────────────┘
```

## WebSocket API

### Client → Server

| 訊息 | 參數 | 說明 |
|------|------|------|
| `login` | `{name: string}` | 玩家登入 |
| `restore_session` | `{sessionToken: string}` | 恢復 session |
| `join_queue` | - | 點擊參戰 |
| `leave_queue` | - | 取消參戰 |
| `move` | `{row: number, col: number}` | 下棋 |
| `chat` | `{message: string}` | 發送聊天 |
| `get_user_info` | - | 取得用戶資訊 |

### Server → Client

| 訊息 | 說明 |
|------|------|
| `login_request` | 要求登入 |
| `login_success` | 登入成功 |
| `lobby_state` | 大廳狀態 |
| `match_start` | 對戰開始 |
| `move` | 棋子移動 |
| `win`/`lose`/`timeout` | 遊戲結果 |
| `opponent_left` | 對手離開 |
| `game_end` | 遊戲結束 |
| `chat_broadcast` | 聊天廣播 |
| `user_info` | 用戶資訊 |
| `time_sync` | 剩餘時間 |

## 玩家狀態

```
CONNECTED → WAITING → QUEUE → PLAYING
                ↑          ↓
            SPECTATING ←───┘
```

## 技術棧

- **後端**：Node.js 20.x + ws (WebSocket)
- **前端**：Vue 3 + TypeScript + Pinia + Vite + Tailwind CSS
- **部署**：Docker

## 檔案結構

```
├── backend/                 # 後端服務
│   ├── index.js            # 入口點
│   ├── GameServer.js       # WebSocket 伺服器
│   ├── MessageHandler.js   # 訊息處理
│   ├── TimerManager.js     # 定時器管理
│   ├── models/             # 類別
│   │   ├── Player.js
│   │   ├── Game.js
│   │   ├── GameRoom.js
│   │   ├── Session.js
│   │   └── SessionManager.js
│   ├── enums/
│   │   └── PlayerStatus.js
│   ├── utils/
│   │   └── gameLogic.js
│   ├── README.md
│   ├── package.json
│   └── Dockerfile
│
├── frontend/               # 前端 (Vue 3)
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── stores/        # Pinia 狀態
│   │   ├── composables/    # WebSocket
│   │   ├── components/     # Vue 元件
│   │   └── types/          # TypeScript
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md
│
├── .dockerignore
└── .gitignore
```

## 遊戲規則

- 棋盤：15 x 15
- 計時：60 秒
- 先手：黑棋 (BLACK)
- 勝利條件：五子連珠

## 授權

MIT License

---

Made with ❤️ for Gobang enthusiasts