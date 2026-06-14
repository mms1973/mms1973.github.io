# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

# Persisted history data lives here — mount a volume to this path
VOLUME ["/app/backend/data"]

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
