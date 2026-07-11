@echo off
setlocal
cd /d "%~dp0"

set "ROOT=%~dp0"
set "CORE_BIN=%ROOT%binary\bin\win32-x64"
set "CORE_OUT=%ROOT%binary\out"
set "BUNDLE=%ROOT%binary\bin\out"

echo ==================================================
echo   Friday one-click build: Core + GUI + Plugin
echo ==================================================

if not exist "%CORE_OUT%\index.js" (
    echo [core] bundle missing, trying esbuild rebuild, needs internet
    cd /d "%ROOT%binary"
    call npm install
    node build.js --esbuild-only
    if not exist "%CORE_OUT%\index.js" (
        echo [core] rebuild failed, check network or run binary/build.js manually
        pause
        exit /b 1
    )
) else (
    echo [core] using existing bundle: binary\out\index.js
)

if not exist "%BUNDLE%" mkdir "%BUNDLE%"
copy /Y "%CORE_OUT%\index.js" "%BUNDLE%\index.js" >nul
for %%f in (index.node llamaTokenizerWorkerPool.mjs tiktokenWorkerPool.mjs xhr-sync-worker.js) do (
    if exist "%CORE_OUT%\%%f" copy /Y "%CORE_OUT%\%%f" "%BUNDLE%\%%f" >nul
)
echo [core] synced bundle to binary\bin\out

if not exist "%CORE_BIN%\rg.exe" (
    if exist "%ROOT%extensions\vscode\node_modules\@vscode\ripgrep\bin\rg.exe" (
        copy /Y "%ROOT%extensions\vscode\node_modules\@vscode\ripgrep\bin\rg.exe" "%CORE_BIN%\rg.exe" >nul
        echo [core] restored rg.exe, codebase search enabled
    ) else (
        echo [WARN] rg.exe not found, codebase search unavailable
    )
) else (
    echo [core] rg.exe present
)

if not exist "%CORE_BIN%\friday-binary.js" (
    echo [core] missing friday-binary.js launcher, cannot start core
    pause
    exit /b 1
)
echo [core] core ready.

echo [core] removing redundant or unused artifacts to keep the package small...
if exist "%CORE_BIN%\index.node" del /f /q "%CORE_BIN%\index.node"
if exist "%CORE_BIN%\friday-binary.exe" del /f /q "%CORE_BIN%\friday-binary.exe"
if exist "%CORE_BIN%\out" rmdir /s /q "%CORE_BIN%\out"

echo.
call "%ROOT%build-plugin.bat" %*

endlocal
