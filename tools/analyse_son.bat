@echo off
chcp 65001 >nul
title Analyse audio - timecodes et frames

REM ===========================================================================
REM analyse_son.bat
REM   Glisser-deposer un fichier audio (.wav ou .mp3) sur ce .bat pour lancer
REM   l'analyse des pics sonores via tools/analyse_audio.py.
REM   Une pause finale laisse le temps de lire les resultats.
REM ===========================================================================

REM Chemin absolu vers le script Python.
set "SCRIPT=D:\remotion\tools\analyse_audio.py"

REM Aucun fichier depose (double-clic) : on explique et on quitte.
if "%~1"=="" (
    echo Aucun fichier fourni.
    echo Glissez-deposez un fichier audio .wav ou .mp3 sur ce .bat.
    echo.
    pause
    exit /b 1
)

echo Fichier : %~1
echo.

REM %~1 = chemin du fichier depose, sans guillemets ; on le re-entoure ici.
python "%SCRIPT%" "%~1"

echo.
pause
