@echo off
setlocal
cd /d "%~dp0\.."

set GIT_EXE=C:\Program Files\Git\cmd\git.exe

if not exist "%GIT_EXE%" (
  echo Git nao encontrado em:
  echo %GIT_EXE%
  echo.
  echo Instale o Git for Windows ou ajuste o caminho no arquivo:
  echo scripts\publish-wiki-data.bat
  pause
  exit /b 1
)

echo Publicando WikiItems.json no GitHub...
echo.

"%GIT_EXE%" add data/WikiItems.json README.md .gitignore content/shared.js content/wiki.js manifest.json popup/index.html popup/popup.js
if errorlevel 1 goto :error

set /p COMMIT_MSG=Mensagem do commit (enter para usar padrao): 
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Atualiza base da Wiki

"%GIT_EXE%" commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo.
  echo Nenhuma mudanca nova para commit ou commit falhou.
)

"%GIT_EXE%" push origin main
if errorlevel 1 goto :error

echo.
echo Publicacao concluida.
echo Agora a galera pode clicar em "Atualizar base" na extensao.
pause
exit /b 0

:error
echo.
echo Falha ao publicar no GitHub.
pause
exit /b 1
