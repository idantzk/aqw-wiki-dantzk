@echo off
setlocal

set SCRIPT_DIR=%~dp0

:menu
cls
echo ==========================================
echo      Atualizador AQW Wiki Dantzk
echo ==========================================
echo.
echo 1. Atualizacao rapida
echo 2. Atualizacao completa
echo 3. Varredura completa
echo 4. Sair
echo.
set /p CHOICE=Escolha uma opcao (1/2/3/4): 

if "%CHOICE%"=="1" goto quick
if "%CHOICE%"=="2" goto complete
if "%CHOICE%"=="3" goto full
if "%CHOICE%"=="4" goto end

echo.
echo Opcao invalida.
pause
goto menu

:quick
cls
echo Rodando atualizacao rapida...
echo.
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%update-from-wiki.ps1" -MaxItems 250
echo.
pause
goto end

:complete
cls
echo Rodando atualizacao completa...
echo.
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%update-from-wiki.ps1" -MaxItems 0
echo.
pause
goto end

:full
cls
echo Rodando varredura completa...
echo.
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%update-from-wiki.ps1" -FullRescan
echo.
pause
goto end

:end
exit /b 0
