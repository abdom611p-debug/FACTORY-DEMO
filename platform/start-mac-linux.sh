#!/usr/bin/env bash
# EGIC · AI Safety & Smart Access Platform — POWERED BY DELMON & DEV SMART X
# macOS / Linux: needs Node.js 18+  (https://nodejs.org)
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
if ! command -v node >/dev/null 2>&1; then echo "Node.js is required: https://nodejs.org"; exit 1; fi
PORT=$PORT node server/server.js &
SRV=$!
sleep 1.5
URL="http://localhost:$PORT/${1:-console.html}"
if command -v open >/dev/null 2>&1; then open "$URL"; else xdg-open "$URL" >/dev/null 2>&1 || echo "Open $URL"; fi
wait $SRV
