FROM node:20-alpine

WORKDIR /app

# 安裝 Production 依賴
COPY package.json ./
RUN npm install --production

# 複製應用程式
COPY server.js ./
COPY gomoku-online.html ./

# 暴露 port 3000
EXPOSE 3000

# 啟動伺服器
CMD ["node", "server.js"]