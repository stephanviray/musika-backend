@echo off
title Musika Server
color 0A
cls

echo.
echo  ============================================
echo   🎵  MUSIKA - Starting servers...
echo  ============================================
echo.

:: Kill anything on port 3456 first (clean restart)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3456 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start proxy in background
echo  [1/2] Starting proxy server (yt-dlp audio extraction)...
start "Musika Proxy" /min cmd /c "node proxy.js & pause"

:: Wait a moment for proxy to initialise
timeout /t 2 /nobreak >nul

:: Start Expo
echo  [2/2] Starting Expo (React Native dev server)...
echo.
echo  ============================================
echo   Scan the QR code below with Expo Go
echo   (Make sure your phone is on same Wi-Fi!)
echo  ============================================
echo.

npx expo start

:: When Expo exits, also kill the proxy window
taskkill /FI "WindowTitle eq Musika Proxy" /F >nul 2>&1
