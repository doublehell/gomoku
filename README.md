# Gobang Online - 五子棋連線對戰

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![WebSocket](https://img.shields.io/badge/ws-8.x-green.svg)

即時連線對戰五子棋遊戲，支援自動配對、觀眾模式、計時系統和即時聊天。

![Preview](https://via.placeholder.com/800x400/1a1a2e/e94560?text=Gobang+Online)

## 功能特色

- 🎮 **自動配對** - 玩家自動排隊，系統隨機配對2人對戰
- 👀 **觀眾模式** - 未配對的玩家自動成為觀眾，即時觀戰
- ⏱️ **計時系統** - 60秒未下棋自動判負
- 💬 **即時聊天** - 全服玩家即時聊天
- 🔄 **Session 保持** - 重新整理維持登入狀態
- 🐳 **Docker 支援** - 一鍵部署至 Docker 或 Kubernetes

## 快速開始

### 本地開發

```bash
# 安裝依賴
npm install

# 啟動伺服器
npm start

# 開啟瀏覽器
open http://localhost:3000
```

### Docker

```bash
# Build
docker build -t gomoku-online:latest .

# Run
docker run -d -p 3000:3000 --name gomoku gomoku-online:latest
```

### Kubernetes

```bash
# 部署
kubectl apply -f k8s-deployment.yaml

# 查看狀態
kubectl get pods -l app=gomoku
```

## 遊戲說明

1. 開啟網頁，輸入暱稱 (2-20字)
2. 系統自動將你加入排隊
3. 配對成功後開始對戰
4. 五子連珠獲勝
5. 遊戲結束後5秒自動重新配對

## 架構設計

```
┌─────────────────────────────────────────┐
│              客戶端 (瀏覽器)              │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐ │
│  │ 登入畫面 │  │ 遊戲畫面 │  │  聊天室  │ │
│  └────┬────┘  └────┬────┘  └────┬─────┘ │
│       │            │             │        │
│       └────────────┼─────────────┘        │
│                    │ WebSocket            │
└────────────────────┼──────────────────────┘
                     │
┌────────────────────┼──────────────────────┐
│              伺服器 (Node.js)            │
│  ┌─────────────────────────────────────┐ │
│  │  • 配對系統 (matchmaking queue)      │ │
│  │  • 遊戲邏輯 (25x25 棋盤)             │ │
│  │  • 計時器 (60s 超時)                 │ │
│  │  • 聊天廣播                          │ │
│  │  • Session 管理                     │ │
│  └─────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

## API 訊息

### Client → Server

| 訊息 | 參數 | 說明 |
|------|------|------|
| `login` | `{name: string}` | 玩家登入 |
| `restore_session` | `{sessionToken: string}` | 恢復 session |
| `move` | `{row: number, col: number}` | 下棋 |
| `chat` | `{message: string}` | 發送聊天 |

### Server → Client

| 訊息 | 參數 | 說明 |
|------|------|------|
| `login_success` | `{name, sessionToken}` | 登入成功 |
| `queue_status` | `{count: number}` | 排隊人數 |
| `player_list` | `{players: [{name, status}]}` | 玩家名單 |
| `match_start` | `{playerColor, opponentName, board}` | 對戰開始 |
| `spectate` | `{players, board}` | 變成觀眾 |
| `move` | `{row, col, player, currentPlayer}` | 對手移動 |
| `time_sync` | `{remaining: number}` | 剩餘時間 |
| `countdown` | `{count: number}` | 5秒倒數 |
| `win`/`lose`/`timeout` | `{winner, reason?}` | 遊戲結束 |
| `chat_broadcast` | `{time, name, message}` | 聊天廣播 |

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `PORT` | 3000 | 伺服器 port |

## 技術棧

- **Runtime**: Node.js 20.x
- **WebSocket**: ws
- **前端**: 原生 HTML/CSS/JS
- **部署**: Docker, Kubernetes

## 檔案結構

```
gomoku-online/
├── server.js              # WebSocket 伺服器
├── gomoku-online.html    # 客戶端頁面
├── package.json           # 專案依賴
├── Dockerfile             # Docker Image
├── k8s-deployment.yaml   # K8s 部署配置
├── .dockerignore          # Docker 忽略檔案
└── .gitignore             # Git 忽略檔案
```

## 授權

MIT License - see [LICENSE](LICENSE) for details.

---

Made with ❤️ for Gobang enthusiasts