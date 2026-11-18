@echo off
rem Netzblick aktualisieren: neuesten Stand von GitHub holen, Pakete installieren,
rem Oberflaeche bauen und ins Android-Projekt kopieren. Danach in Android Studio auf Run druecken.
cd /d "%~dp0"
echo.
echo === Netzblick aktualisieren ===
echo.
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Git konnte nicht aktualisieren. Meist gibt es lokale Aenderungen im Projektordner.
  echo Diese beiseitelegen mit:   git stash
  echo und danach dieses Skript noch einmal starten.
  echo.
  pause
  exit /b 1
)
echo.
call npm run sync
if errorlevel 1 (
  echo.
  echo Der Build ist fehlgeschlagen. Die Meldung oben zeigt den Grund.
  echo.
  pause
  exit /b 1
)
echo.
echo Fertig. Jetzt in Android Studio auf Run druecken.
echo.
pause
