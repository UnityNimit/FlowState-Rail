@echo off
echo ========================================================
echo  Launching FlowState-Rail (Backend + Frontend)
echo ========================================================
start "FlowState Backend (Port 8001)" cmd /k "cd /d ""%~dp0Backend"" && set PYTHONIOENCODING=utf-8 && python -m uvicorn main:socket_app --host 0.0.0.0 --port 8001 --reload"
timeout /t 3 /nobreak >nul
start "FlowState Frontend (Port 3000)" cmd /k "cd /d ""%~dp0frontend"" && npm start"
echo Both services launched in separate windows!
