@echo off
title Remotion Studio
cd /d "D:\remotion"
echo ============================================
echo   Demarrage de Remotion Studio...
echo   (Ne fermez pas cette fenetre tant que
echo    vous utilisez le studio)
echo ============================================
echo.
call npm run dev
echo.
echo Le serveur s'est arrete.
pause
