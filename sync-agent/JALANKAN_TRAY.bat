@echo off
cd /d "%~dp0"

:: Cek apakah sudah berjalan
tasklist /fi "IMAGENAME eq pythonw.exe" 2>nul | find /i "pythonw.exe" >nul
if %errorlevel% == 0 (
    echo.
    echo  Sync Agent sudah berjalan di background.
    echo  Lihat icon di system tray (pojok kanan bawah).
    echo.
    timeout /t 3 /nobreak >nul
    exit /b 0
)

:: Jalankan tanpa jendela CMD menggunakan pythonw
start "" /B pythonw sync_tray.py

:: Jika pythonw tidak ada, coba python biasa via VBS silent
if %errorlevel% neq 0 (
    wscript.exe run_silent_tray.vbs
)
