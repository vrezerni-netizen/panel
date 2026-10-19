@echo off
chcp 65001 >nul
title Akhmat Zapad - autostart
cd /d "%~dp0"
if not exist "%USERPROFILE%\AkhmatZapad-data\streamvault.db" goto first
set "AZ_DIR=%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\AkhmatZapad.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments='""'+$env:AZ_DIR+'run-hidden.vbs""'; $s.WorkingDirectory=$env:AZ_DIR; $s.Save(); Set-Content -Path ([Environment]::GetFolderPath('Desktop')+'\Akhmat Zapad.url') -Value ('[InternetShortcut]'+[Environment]::NewLine+'URL=http://localhost:3000') -Encoding ASCII"
if errorlevel 1 goto fail
echo.
echo DONE. The server will now start by itself when Windows starts (no window).
echo A shortcut 'Akhmat Zapad' was placed on your Desktop - it opens the panel.
echo Starting the server now...
wscript "%~dp0run-hidden.vbs"
echo Wait 10 seconds, then open the Desktop shortcut.
pause
exit /b 0
:first
echo First run start-windows.bat once, create the admin, then run this file.
pause
exit /b 1
:fail
echo Could not create the shortcut.
pause
exit /b 1
