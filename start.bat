@echo off
echo ========================================================
echo  Launching FlowState-Rail (Backend + Frontend)
echo ========================================================
start "FlowState Backend (Port 8002)" cmd /k "cd /d ""%~dp0Backend"" && (if exist venv\Scripts\activate.bat call venv\Scripts\activate.bat) && (if exist .venv\Scripts\activate.bat call .venv\Scripts\activate.bat) && set PYTHONIOENCODING=utf-8 && python -m uvicorn main:socket_app --host 0.0.0.0 --port 8002 --reload"
timeout /t 3 /nobreak >nul
start "FlowState Frontend (Port 3000)" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"
echo Both services launched in separate windows!
