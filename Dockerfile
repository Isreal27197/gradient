FROM node:20-bookworm-slim AS base
WORKDIR /app

# System deps needed to build better-sqlite3 (native module)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# --- server deps ---
COPY package*.json ./
RUN npm ci --omit=dev

# --- client build ---
COPY client/package*.json client/
RUN cd client && npm ci
COPY client client
RUN cd client && npm run build

# --- server source ---
COPY server server
COPY scripts scripts

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000

# /data is where the SQLite file + jwt secret persist — mount a volume here
VOLUME ["/data"]

CMD ["node", "server/index.js"]
