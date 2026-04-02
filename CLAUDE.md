# Gobang Online - 五子棋連線對戰

## 專案資訊
- 即時連線對戰五子棋遊戲
- Node.js + WebSocket
- 25x25 棋盤，60秒計時
- Docker 部署

## 技術棧
- Backend: Node.js 20.x + ws
- Frontend: 原生 HTML/CSS/JS

## 檔案結構
```
├── backend/                 # 後端服務
│   ├── index.js            # 入口點
│   ├── GameServer.js       # WebSocket 伺服器
│   ├── models/             # 類別
│   ├── enums/              # 列舉
│   ├── utils/              # 工具函式
│   ├── package.json
│   └── Dockerfile
│
├── frontend/               # 前端頁面
│   ├── gomoku-online.html # 客戶端頁面
│   ├── package.json
│   └── Dockerfile
│
├── .dockerignore
└── .gitignore
```

## 部署命令
```bash
# 後端
cd backend && npm install
npm start

# 前端
cd frontend && npm install
npm start

# Docker
docker run -d -p 3000:3000 --name gomoku-backend backend:latest
docker run -d -p 8080:80 --name gomoku-frontend frontend:latest
```

## 重要筆記
- 支援外部網路存取 (使用 window.location.host 動態連線)
- 伺服器 console 輸出玩家連線 IP 和聊天紀錄
- 資安: XSS 防護、Path Traversal 防護已完成
- OOP 重構完成 - 使用類別管理狀態