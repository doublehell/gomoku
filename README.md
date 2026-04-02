# Gobang Online - 五子棋連線對戰

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![WebSocket](https://img.shields.io/badge/ws-8.x-green.svg)

即時連線對戰五子棋遊戲，支援自動配對、觀眾模式、計時系統和即時聊天。

![Preview](https://via.placeholder.com/800x400/1a1a2e/e94560?text=Gobang+Online)

## 功能特色

- 🎮 **手動參戰** - 點擊「我要參戰」按鈕開始配對
- 👀 **觀眾模式** - 未參戰的玩家自動成為觀眾，即時觀戰
- ⏱️ **計時系統** - 60秒未下棋自動判負
- 💬 **即時聊天** - 全服玩家即時聊天 (含頻率限制)
- 🔄 **Session 保持** - 重新整理維持登入狀態
- 🐳 **Docker 支援** - 一鍵部署至 Docker 或 Kubernetes
- 🔒 **資安防護** - XSS 防護、Path Traversal 防護、IP 記錄

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
2. 點擊「我要參戰」按鈕
3. 湊滿2人後開始5秒倒數配對
4. 對戰開始，五子連珠獲勝
5. 遊戲結束後需再次點擊參戰

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
| `join_queue` | - | 點擊參戰 |
| `leave_queue` | - | 取消參戰 |
| `move` | `{row: number, col: number}` | 下棋 |
| `chat` | `{message: string}` | 發送聊天 |

### Server → Client

| 訊息 | 參數 | 說明 |
|------|------|------|
| `login_success` | `{name, sessionToken}` | 登入成功 |
| `queue_status` | `{count: number}` | 參戰人數 |
| `match_waiting` | `{message: string}` | 等待配對訊息 |
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

## 資安稽核

| 檢查項目 | 狀態 | 風險等級 |
|---------|------|---------|
| 公司資訊 (Realtek/RTK) | ✅ 無 | - |
| 認證金鑰外洩 | ✅ 無 | - |
| IP 位址外洩 | ✅ 無 | - |
| XSS | ✅ 安全 | - |
| 陣列越界 | ✅ 安全 | - |
| Session 清理 | ✅ 安全 (5分鐘過期) | - |
| 頻率限制 (防 Spam) | ✅ 已實作 | - |
| Path Traversal | ✅ 已防護 | - |

### 伺服器監控

伺服器 console 會輸出以下資訊：
- 玩家連線記錄 (含 IP)
- 聊天訊息記錄 (含 IP)
- 遊戲事件紀錄

範例輸出：
```
玩家 1234567890 連線, IP: 192.168.1.100
[聊天] 小明 (192.168.1.100): Hello world
```

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