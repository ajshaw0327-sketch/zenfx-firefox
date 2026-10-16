@echo off
cd /d "%~dp0"
py -3 installer\install.py --gui
if errorlevel 1 pause
