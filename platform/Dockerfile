# EGIC Platform — web UI + zero-dependency Node API server (REST + live SSE + evidence storage)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /srv
COPY . .

# Railway injects PORT (the server then binds 0.0.0.0). Mount a volume and set DATA_DIR=/data to keep evidence across deploys.
EXPOSE 8080
RUN apk add --no-cache ffmpeg

CMD ["node", "server/server.js"]
