# Gobang Online - 五子棋連線對戰

## 專案資訊
- 即時連線對戰五子棋遊戲
- Node.js + WebSocket
- 25x25 棋盤，60秒計時
- 支援 Docker / Kubernetes 部署

## 技術棧
- Runtime: Node.js 20.x
- WebSocket: ws
- 前端: 原生 HTML/CSS/JS

## 檔案結構
```
├── server.js              # WebSocket 伺服器
├── gomoku-online.html     # 客戶端頁面
├── package.json
├── Dockerfile
├── k8s-deployment.yaml
├── .dockerignore
└── .gitignore
```

## 近期更新 (2024-04)
- Session 記憶體洩漏修復 (5分鐘過期)
- 聊天訊息頻率限制 (1秒冷卻)
- Path Traversal 防護
- IP 位址記錄功能

## 部署命令
```bash
# Docker
docker run -d -p 3000:3000 --name gomoku gomoku-online:latest
```

## 重要筆記
- 支援外部網路存取 (使用 window.location.host 動態連線)
- 伺服器 console 輸出玩家連線 IP 和聊天紀錄
- 資安: XSS 防護、Path Traversal 防護已完成