@echo off
chcp 65001 >nul
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*scripts*local.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Stop-Process -Name mediamtx -Force -ErrorAction SilentlyContinue"
echo Server stopped.
pause
