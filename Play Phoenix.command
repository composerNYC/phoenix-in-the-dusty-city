#!/bin/bash
# Double-click to play Phoenix in the Dusty City in your browser.
cd "$(dirname "$0")"
PORT=8777
python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER=$!
sleep 1
open "http://localhost:$PORT/index.html"
echo ""
echo "  Phoenix in the Dusty City is running at http://localhost:$PORT"
echo "  Keep this window open while you play. Close it to stop the game server."
echo ""
trap "kill $SERVER 2>/dev/null" EXIT
wait $SERVER
