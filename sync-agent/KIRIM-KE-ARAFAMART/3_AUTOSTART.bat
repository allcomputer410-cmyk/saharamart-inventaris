@echo off
title [LANGKAH 3] Setup Auto-Start - ARAFAMART
color 0A
cd /d "%~dp0"

echo.
echo  ============================================================
echo    SYNC AGENT iPOS - ARAFAMART (ARM01)
echo    Langkah 3: Aktifkan auto-start saat PC menyala
echo    (Tidak perlu Run as Administrator)
echo  ============================================================
echo.

set SCRIPT_DIR=%~dp0
set VBS_PATH=%SCRIPT_DIR%run_silent.vbs
set REG_KEY=HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
set REG_NAME=iPOS_SyncAgent_Arafamart

echo  [1/3] Daftarkan ke Windows registry...
reg add "%REG_KEY%" /v "%REG_NAME%" /t REG_SZ /d "wscript.exe \"%VBS_PATH%\"" /f

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ============================================================
    echo   GAGAL mendaftarkan ke registry.
    echo.
    echo   Cara manual (alternatif):
    echo   1. Tekan Win+R, ketik: shell:startup, Enter
    echo   2. Copy shortcut 2_JALANKAN.bat ke folder yang terbuka
    echo  ============================================================
    pause
    exit /b 1
)

echo  OK - Terdaftar di registry auto-start

echo.
echo  [2/3] Verifikasi pendaftaran...
reg query "%REG_KEY%" /v "%REG_NAME%"

echo.
echo  [3/3] Jalankan sekarang...
start "" /B wscript.exe "%VBS_PATH%"

echo.
echo  ============================================================
echo   BERHASIL! Auto-start sudah aktif via Windows registry.
echo.
echo   Sync Agent akan otomatis berjalan setiap PC dinyalakan.
echo   Icon muncul di pojok kanan bawah (system tray).
echo.
echo   Data sync setiap 2 menit ke Supabase cloud.
echo.
echo   Untuk cek: buka Registry Editor ^> HKCU^>SOFTWARE^>
echo   Microsoft^>Windows^>CurrentVersion^>Run
echo  ============================================================
echo.
pause
