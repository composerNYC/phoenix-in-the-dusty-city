@echo off
REM Double-click to play Phoenix in the Dusty City in your browser (needs Python).
cd /d "%~dp0"
start "" "http://localhost:8777/index.html"
echo Phoenix in the Dusty City is running at http://localhost:8777
echo Keep this window open while you play. Close it to stop the game server.
python -m http.server 8777 || py -m http.server 8777
