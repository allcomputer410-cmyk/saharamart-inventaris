@echo off
title Install Sync Agent Tray
color 0A
cd /d "%~dp0"

echo.
echo  ============================================================
echo    INSTALL LIBRARY UNTUK SYNC AGENT TRAY
echo    (Cukup dijalankan SEKALI saja)
echo  ============================================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python belum terinstall!
    echo  Download dari: https://www.python.org/downloads/
    echo  Centang "Add Python to PATH" saat install.
    echo.
    pause
    exit /b 1
)

echo  Menginstall library sync agent...
pip install -r requirements.txt

echo.
echo  Menginstall library tray (pystray + Pillow)...
pip install pystray Pillow

if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Gagal install. Coba jalankan sebagai Administrator.
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   SELESAI! Semua library berhasil diinstall.
echo.
echo   Sekarang double-click: JALANKAN_TRAY.bat
echo  ============================================================
echo.
pause
