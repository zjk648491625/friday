@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ========================================
echo   Friday VSCode Plugin Build Script
echo ========================================

echo [1/4] Building GUI frontend...
cd /d "%ROOT%gui"
call npx vite build
if !ERRORLEVEL! neq 0 (
    echo ERROR: GUI build failed!
    pause
    exit /b 1
)

echo [2/4] Copying GUI assets to VSCode plugin...
cd /d "%ROOT%"
xcopy "%ROOT%gui\dist\*" "%ROOT%extensions\vscode\gui\" /E /Y /Q
echo   GUI assets copied.

echo [3/4] Building VSCode extension (esbuild + native modules)...
cd /d "%ROOT%extensions\vscode"
call npm install
node scripts/esbuild.js --minify
if !ERRORLEVEL! neq 0 (
    echo ERROR: esbuild failed!
    pause
    exit /b 1
)

:: Copy sqlite3 native module
if not exist "out\Release" mkdir "out\Release"
if exist "%ROOT%build\Release\node_sqlite3.node" (
    copy /Y "%ROOT%build\Release\node_sqlite3.node" "out\Release\node_sqlite3.node" >nul
    echo   sqlite3 native module copied.
) else (
    echo   WARNING: sqlite3 native not found at %ROOT%build\Release\node_sqlite3.node
)

:: Copy xhr-sync-worker.js for jsdom
if exist "%ROOT%core\node_modules\jsdom\lib\jsdom\living\xhr\xhr-sync-worker.js" (
    copy /Y "%ROOT%core\node_modules\jsdom\lib\jsdom\living\xhr\xhr-sync-worker.js" "out\xhr-sync-worker.js" >nul
    echo   xhr-sync-worker.js copied.
)

:: Copy lru-cache to out/node_modules/ (included in VSIX per .vscodeignore)
if not exist "out\node_modules" mkdir "out\node_modules"
if exist "node_modules\lru-cache" (
    xcopy "node_modules\lru-cache" "out\node_modules\lru-cache\" /E /Y /Q >nul
    echo   lru-cache copied to out/node_modules/.
)

:: Copy tree-sitter.wasm
if exist "%ROOT%core\vendor\tree-sitter.wasm" (
    copy /Y "%ROOT%core\vendor\tree-sitter.wasm" "out\tree-sitter.wasm" >nul
    echo   tree-sitter.wasm copied.
)

echo [4/4] Packaging VSIX...
call npx vsce package --skip-license --no-dependencies
if !ERRORLEVEL! neq 0 (
    echo ERROR: VSIX packaging failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BUILD SUCCESSFUL!
echo ========================================
dir "%ROOT%extensions\vscode\friday-ai-*.vsix" 2>nul
if errorlevel 1 echo   (VSIX file may have different name pattern)
endlocal
