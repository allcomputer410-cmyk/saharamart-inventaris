@echo off
title Setup Auto-Start Sync Agent Tray
color 0A
cd /d "%~dp0"

echo.
echo  ============================================================
echo    SETUP AUTO-START SYNC AGENT TRAY
echo    Sync akan berjalan otomatis saat Windows menyala
echo    (icon muncul di system tray tanpa perlu buka apapun)
echo  ============================================================
echo.
echo  *** Harus dijalankan sebagai ADMINISTRATOR ***
echo.

:: Cek Administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Jalankan sebagai Administrator!
    echo  Klik KANAN file ini → "Run as administrator"
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0

:: Cek apakah pakai .exe atau .py
if exist "%SCRIPT_DIR%dist\SyncAgent-App\SyncAgent.exe" (
    :: Gunakan .exe jika sudah dibuild
    set TARGET="%SCRIPT_DIR%dist\SyncAgent-App\SyncAgent.exe"
    set TASK_ACTION=/tr %TARGET%
    set MODE=exe
) else (
    :: Gunakan VBS launcher
    set TARGET=%SCRIPT_DIR%run_silent_tray.vbs
    set TASK_ACTION=/tr "wscript.exe \"%TARGET%\""
    set MODE=script
)

set TASK_NAME=iPOS_SyncAgent_Tray_Saharamart

echo  Mode     : %MODE%
echo  Target   : %TARGET%
echo.

echo  [1/3] Hapus task lama...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
echo  OK

echo  [2/3] Daftarkan task auto-start...
schtasks /create /tn "%TASK_NAME%" %TASK_ACTION% /sc ONLOGON /rl HIGHEST /f

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  GAGAL mendaftarkan task.
    echo  Coba cara manual: Win+R → shell:startup
    echo  Copy shortcut JALANKAN_TRAY.bat ke folder Startup.
    pause
    exit /b 1
)

echo  [3/3] Jalankan sekarang...
schtasks /run /tn "%TASK_NAME%"

echo.
echo  ============================================================
echo   BERHASIL!
echo.
echo   Sync Agent Tray akan otomatis aktif saat login Windows.
echo   Icon akan muncul di system tray ^(pojok kanan bawah^).
echo.
echo   Untuk cek: lihat sync_agent.log atau Sync Monitor di app.
echo  ============================================================
echo.
pause
