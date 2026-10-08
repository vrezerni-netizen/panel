' Starts Akhmat Zapad server in background (no window). Log: %USERPROFILE%\AkhmatZapad-data\server.log
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "cmd /c set NO_OPEN=1&& node scripts\local.js > ""%USERPROFILE%\AkhmatZapad-data\server.log"" 2>&1", 0, False
