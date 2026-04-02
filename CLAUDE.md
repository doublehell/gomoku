# Gobang Online - 五子棋連線對戰

## 專案資訊
- 即時連線對戰五子棋遊戲
- Node.js + WebSocket
- 15x15 標準棋盤，60秒計時
- Docker 部署

## 技術棧
- Backend: Node.js 20.x + ws
- Frontend: Vue 3 + TypeScript + Pinia + Vite + Tailwind CSS

## 檔案結構
```
├── backend/                 # 後端服務
│   ├── index.js            # 入口點
│   ├── GameServer.js       # WebSocket 伺服器
│   ├── MessageHandler.js   # 訊息處理
│   ├── TimerManager.js    # 計時器管理
│   ├── models/             # 類別 (Game, GameRoom, Player, Session)
│   ├── enums/              # 列舉 (PlayerStatus)
│   ├── utils/              # 工具函式 (gameLogic)
│   ├── package.json
│   └── Dockerfile
│
├── frontend/               # 前端頁面 (Vue 3)
│   ├── src/
│   │   ├── main.ts        # 入口
│   │   ├── App.vue        # 根元件
│   │   ├── router/        # 路由配置
│   │   ├── stores/        # Pinia 狀態 (player, game, chat)
│   │   ├── composables/   # WebSocket 連線
│   │   ├── components/    # Vue 元件
│   │   └── types/         # TypeScript 類型
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md
│
├── .dockerignore
└── .gitignore
```

## 路由
| 路徑 | 說明 |
|------|------|
| `/` | 登入頁面 |
| `/lobby` | 大廳 |
| `/gomoku` | 對戰棋盤 |

## 開發命令
```bash
# 後端
cd backend && npm install
npm start

# 前端
cd frontend && npm install
npm run dev

# Docker
docker run -d -p 3000:3000 --name gomoku-backend backend:latest
docker run -d -p 8080:80 --name gomoku-frontend frontend:latest
```

## WebSocket 訊息
- 客戶端發送: login, join_queue, leave_queue, restore_session, move, chat
- 伺服器發送: login_request, login_success, error, match_start, spectate, move, win, lose, timeout, game_end, time_sync, chat_broadcast

## 重要筆記
- 前端使用 Vite proxy 連線 WebSocket (`/ws` → 後端 `ws://localhost:3000/ws`)
- 棋盤為標準 15x15，包含 9 個星位點
- 支援 session 恢復機制
- 支援觀戰模式
- 60 秒計時，超時判負