FROM node:20-alpine

# 1 – deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 2 – source
COPY src ./src

# 3 – run
ENV NODE_ENV=production      \
    MCP_HTTP=1               \
    PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
