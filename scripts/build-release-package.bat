@echo off
setlocal
cd /d "%~dp0\.."

set DIST_DIR=dist
set PACKAGE_DIR=%DIST_DIR%\AQW-WIKI-DANTZK
set ZIP_FILE=%DIST_DIR%\AQW-WIKI-DANTZK.zip

if exist "%PACKAGE_DIR%" rmdir /s /q "%PACKAGE_DIR%"
if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%"
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"

mkdir "%PACKAGE_DIR%"
mkdir "%PACKAGE_DIR%\content"
mkdir "%PACKAGE_DIR%\data"
mkdir "%PACKAGE_DIR%\images"
mkdir "%PACKAGE_DIR%\popup"

copy /y "manifest.json" "%PACKAGE_DIR%\" >nul
copy /y "background.js" "%PACKAGE_DIR%\" >nul
copy /y "README.md" "%PACKAGE_DIR%\" >nul
xcopy /e /i /y "content" "%PACKAGE_DIR%\content" >nul
xcopy /e /i /y "data" "%PACKAGE_DIR%\data" >nul
xcopy /e /i /y "images" "%PACKAGE_DIR%\images" >nul
xcopy /e /i /y "popup" "%PACKAGE_DIR%\popup" >nul

if exist "%PACKAGE_DIR%\data\backups" rmdir /s /q "%PACKAGE_DIR%\data\backups"

tar -a -c -f "%ZIP_FILE%" -C "%PACKAGE_DIR%" .

echo.
echo Pacote criado com sucesso:
echo %CD%\%ZIP_FILE%
echo.
echo Esse ZIP e o ideal para subir em Releases no GitHub ou mandar para a galera.
pause
