# Gomoku Frontend - 五子棋對戰前端

Vue 3 開發的五子棋線上對戰遊戲前端。

## 技術棧

| 技術 | 用途 |
|------|------|
| Vue 3 | 框架 (Composition API) |
| TypeScript | 類型安全 |
| Pinia | 狀態管理 |
| Vue Router | 路由 |
| Vite | 構建工具 |
| Tailwind CSS | 樣式 |

## 專案結構

```
frontend/
├── src/
│   ├── main.ts              # 入口
│   ├── App.vue              # 根元件
│   ├── router/
│   │   └── index.ts         # 路由配置
│   ├── stores/
│   │   ├── player.ts        # 玩家狀態
│   │   ├── game.ts         # 遊戲狀態
│   │   └── chat.ts         # 聊天狀態
│   ├── composables/
│   │   └── useWebSocket.ts  # WebSocket 連線
│   ├── components/
│   │   ├── LoginView.vue    # 登入
│   │   ├── LobbyView.vue    # 大廳
│   │   ├── GameView.vue    # 對戰
│   │   ├── GameBoard.vue   # 棋盤
│   │   ├── SpectatorList.vue # 玩家列表
│   │   └── ChatBox.vue      # 聊天
│   ├── types/
│   │   └── index.ts        # TypeScript 類型
│   └── assets/
│       └── main.css        # Tailwind
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

## 開發

```bash
# 安裝依賴
npm install

# 開發伺服器 (http://localhost:8080)
npm run dev

# 建置生產版本
npm run build
```

## 路由

| 路徑 | 說明 |
|------|------|
| `/` | 登入頁面 |
| `/lobby` | 大廳 |
| `/gomoku` | 對戰棋盤 |

## 與後端連線

- 開發環境：透過 Vite proxy 連線 `ws://localhost:8080/ws` → `ws://localhost:3000/ws`
- 生產環境：直接連線到後端伺服器