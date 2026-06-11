@echo off
REM Script de lancement du jeu Songo sur Windows
REM Lance un serveur HTTP local et ouvre le jeu dans le navigateur

setlocal enabledelayedexpansion

set PORT=8000

REM Se positionner dans le répertoire du script
cd /d "%~dp0" || (
  echo.
  echo ❌ Impossible d'acceder au repertoire du jeu
  pause
  exit /b 1
)

echo.
echo 🎮 Demarrage du jeu Songo...
echo 📂 Repertoire : %cd%
echo 📍 Accédez au jeu a : http://localhost:%PORT%
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig 2^>nul ^| find /i "ipv4"') do (
  set IP=%%a
  goto :found
)

:found
if defined IP (
  echo 📡 Pour jouer depuis une autre machine du reseau :
  echo    http:!IP:~1!:%PORT%
)

echo.
echo Appuyez sur Ctrl+C pour arreter le serveur
echo.

python -m http.server %PORT% >nul 2>&1
if errorlevel 1 (
  python3 -m http.server %PORT% >nul 2>&1
)

if errorlevel 1 (
  echo.
  echo ❌ Python n'est pas installe ou ne fonctionne pas
  echo    Installez Python depuis https://www.python.org
  pause
  exit /b 1
)
