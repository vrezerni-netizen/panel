@echo off
chcp 65001 >nul
title Akhmat Zapad
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist node_modules goto install
:run
node scripts\local.js
pause
exit /b 0
:install
echo Installing components, please wait...
call npm install --omit=dev
if errorlevel 1 goto fail
goto run
:nonode
echo Node.js is not installed.
echo Install Node.js LTS from https://nodejs.org then run this file again.
pause
exit /b 1
:fail
echo Installation failed. Check internet connection and run again.
pause
exit /b 1
