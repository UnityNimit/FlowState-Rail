@echo off
echo ========================================================
echo  Starting FlowState-Rail Backend (FastAPI + OR-Tools)
echo  Listening on: http://localhost:8001
echo ========================================================
set PYTHONIOENCODING=utf-8
cd /d "%~dp0Backend"
python -m uvicorn main:socket_app --host 0.0.0.0 --port 8001 --reload
pause
