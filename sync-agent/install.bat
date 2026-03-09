@echo off
echo ============================================
echo   iPOS Sync Agent - Installer
echo ============================================
echo.

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python tidak ditemukan. Install Python 3.8+ dari python.org
    pause
    exit /b 1
)

:: Install dependencies
echo Installing dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Gagal install dependencies
    pause
    exit /b 1
)

:: Copy .env if not exists
if not exist .env (
    copy .env.example .env
    echo.
    echo PENTING: Edit file .env dengan kredensial yang benar!
    echo   - SUPABASE_SERVICE_KEY dari Supabase Dashboard
    echo   - IPOS_DB_PASS dari password PostgreSQL iPOS
    echo.
)

echo.
echo Installation selesai!
echo.
echo Cara menjalankan:
echo   python sync_agent.py           (sync sekali)
echo   python sync_agent.py --daemon  (jalankan terus-menerus)
echo.
pause
