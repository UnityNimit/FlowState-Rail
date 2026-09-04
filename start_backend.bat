@echo off
echo ========================================================
echo  Starting FlowState-Rail Backend (FastAPI + OR-Tools)
echo  Listening on: http://localhost:8002
echo ========================================================
set PYTHONIOENCODING=utf-8
cd /d "%~dp0Backend"
call venv\Scripts\activate.bat
python -m uvicorn main:socket_app --host 0.0.0.0 --port 8002 --reload
pause
