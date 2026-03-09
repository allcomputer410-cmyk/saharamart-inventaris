@echo off
echo ============================================
echo   Setup Auto-Start saat Windows Boot
echo ============================================
echo.

:: Create shortcut in Startup folder
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT_DIR=%~dp0

echo Creating startup shortcut...
(
    echo Set oWS = WScript.CreateObject("WScript.Shell"^)
    echo sLinkFile = "%STARTUP%\iPOS Sync Agent.lnk"
    echo Set oLink = oWS.CreateShortcut(sLinkFile^)
    echo oLink.TargetPath = "%SCRIPT_DIR%run_daemon.bat"
    echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
    echo oLink.Description = "iPOS Sync Agent"
    echo oLink.WindowStyle = 7
    echo oLink.Save
) > "%TEMP%\create_shortcut.vbs"
cscript //nologo "%TEMP%\create_shortcut.vbs"
del "%TEMP%\create_shortcut.vbs"

echo.
echo Shortcut dibuat di: %STARTUP%
echo Sync agent akan otomatis jalan saat Windows boot.
echo.
pause
