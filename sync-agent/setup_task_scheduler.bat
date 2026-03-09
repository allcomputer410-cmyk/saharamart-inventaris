@echo off
:: ============================================================
:: setup_task_scheduler.bat
:: Daftarkan sync agent ke Windows Task Scheduler
:: Jalankan sekali saja sebagai ADMINISTRATOR
:: ============================================================

echo.
echo  ============================================================
echo    Setup Auto-Sync iPOS → Supabase
echo    Sync agent akan berjalan otomatis saat PC menyala
echo  ============================================================
echo.

:: Pastikan dijalankan sebagai Administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Harus dijalankan sebagai Administrator!
    echo  Klik kanan file ini lalu pilih "Run as administrator"
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0
set VBS_PATH=%SCRIPT_DIR%run_silent.vbs
set TASK_NAME=iPOS_SyncAgent_Saharamart

echo  [1/3] Hapus task lama jika ada...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

echo  [2/3] Daftarkan task baru...
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "wscript.exe \"%VBS_PATH%\"" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Gagal daftarkan task. Coba cara manual di bawah.
    goto MANUAL
)

echo  [3/3] Jalankan sekarang (tidak perlu restart)...
schtasks /run /tn "%TASK_NAME%"

echo.
echo  ============================================================
echo   BERHASIL! Sync agent sudah terdaftar.
echo.
echo   Task  : %TASK_NAME%
echo   Trigger: Otomatis saat login Windows
echo   Mode  : Background (tidak ada jendela CMD)
echo   Log   : %SCRIPT_DIR%sync_agent.log
echo  ============================================================
echo.
echo  Untuk cek status sync: buka file sync_agent.log
echo  Untuk hentikan       : Task Manager ^> Tab Services ^> cari wscript
echo.
pause
exit /b 0

:MANUAL
echo.
echo  ============================================================
echo   CARA MANUAL (jika otomatis gagal):
echo.
echo   1. Tekan Win+R, ketik: taskschd.msc
echo   2. Klik "Create Basic Task"
echo   3. Name: iPOS Sync Agent
echo   4. Trigger: When I log on
echo   5. Action: Start a program
echo   6. Program: wscript.exe
echo   7. Arguments: "%VBS_PATH%"
echo   8. Finish
echo  ============================================================
echo.
pause
