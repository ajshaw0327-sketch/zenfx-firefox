@echo off
cd /d "%~dp0"
py -3 installer\install.py --guided
if errorlevel 1 pause
