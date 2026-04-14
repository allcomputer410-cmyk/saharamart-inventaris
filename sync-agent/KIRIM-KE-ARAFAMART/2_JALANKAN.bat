@echo off
title Sync Agent - ARAFAMART
cd /d "%~dp0"

:: Hapus lock file lama jika ada (bisa tertinggal kalau program crash)
if exist "sync.lock" del /f /q "sync.lock" >nul 2>&1

:: Cek Python tersedia
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ============================================================
    echo   PYTHON TIDAK DITEMUKAN!
    echo   Jalankan dulu: 1_INSTALL.bat
    echo  ============================================================
    pause
    exit /b 1
)

:: Cek file sync_tray.py ada
if not exist "sync_tray.py" (
    echo.
    echo  ============================================================
    echo   ERROR: sync_tray.py tidak ditemukan!
    echo   Pastikan file ini dijalankan dari folder yang benar.
    echo  ============================================================
    pause
    exit /b 1
)

:: Cek .env ada
if not exist ".env" (
    echo.
    echo  ============================================================
    echo   ERROR: File .env tidak ditemukan!
    echo   Pastikan file .env ada di folder yang sama.
    echo  ============================================================
    pause
    exit /b 1
)

:: Jalankan sync_tray.py tanpa jendela CMD
start "" pythonw sync_tray.py

:: Tunggu sebentar lalu cek apakah berhasil start
timeout /t 3 /nobreak >nul

tasklist 2>nul | find /i "pythonw.exe" >nul
if %errorlevel% == 0 (
    echo.
    echo  Sync Agent berhasil dijalankan.
    echo  Lihat icon di system tray pojok kanan bawah.
    timeout /t 2 /nobreak >nul
) else (
    echo.
    echo  ============================================================
    echo   pythonw gagal. Mencoba dengan python biasa...
    echo  ============================================================
    start "" /B python sync_tray.py
    timeout /t 2 /nobreak >nul
)
