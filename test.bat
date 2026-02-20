@echo off
echo =======================================================
echo Web Watcher - Full Local Testing Automation Script
echo =======================================================

echo.
echo [1/3] Installing/Verifying Python Dependencies...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies. Please check your Python installation.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Verifying Playwright Browsers...
playwright install chromium
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Playwright browsers.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Starting Netlify Local Environment...
echo -------------------------------------------------------
echo NOTE: A new window will open to run the Python Scraper!
echo To test, go to http://localhost:8888 and add a monitor.
echo -------------------------------------------------------
echo.

REM Start Python scraper in a new minimized command window
start "Web Watcher Bot" cmd /c "echo Starting Python Scraper Bot (Runs every 20 seconds for testing)... & :loop & py scraper.py & timeout /t 20 >nul & goto loop"

REM Start Netlify in this main window
echo Starting Local Netlify Server...
call npx netlify dev

pause
