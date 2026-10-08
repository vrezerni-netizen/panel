@echo off
chcp 65001 >nul
title Ахмат Запад
cd /d "%~dp0"
where node >nul 2>nul || (echo Установите Node.js 22 с https://nodejs.org и запустите снова & pause & exit /b 1)
if not exist node_modules (echo Устанавливаю компоненты, подождите... & call npm install --omit=dev)
node scripts\local.js
pause
