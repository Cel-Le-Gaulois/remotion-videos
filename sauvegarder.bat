@echo off
title Sauvegarde Git - Remotion
cd /d "D:\remotion"

echo ============================================
echo   Sauvegarde du projet Remotion sur GitHub
echo ============================================
echo.

set "msg="
set /p "msg=Message de sauvegarde (entree = "sauvegarde") : "
if "%msg%"=="" set "msg=sauvegarde"

echo.
echo --- git add . ---
git add .

echo.
echo --- git commit -m "%msg%" ---
git commit -m "%msg%"

echo.
echo --- git push origin main ---
git push origin main

echo.
echo ============================================
echo   Termine. Verifiez les messages ci-dessus.
echo ============================================
pause
