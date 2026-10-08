@echo off
chcp 65001 >nul
powershell -NoProfile -Command "Remove-Item ([Environment]::GetFolderPath('Startup')+'\AkhmatZapad.lnk') -ErrorAction SilentlyContinue; Remove-Item ([Environment]::GetFolderPath('Desktop')+'\Akhmat Zapad.url') -ErrorAction SilentlyContinue"
echo Autostart removed. Run stop-server.bat to stop the running server.
pause
