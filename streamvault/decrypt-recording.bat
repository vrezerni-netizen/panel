@echo off
chcp 65001 >nul
title Decrypt recording
cd /d "%~dp0"
node src\vault-cli.js wizard
pause
