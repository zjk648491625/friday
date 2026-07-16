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
if %ERRORLEVEL% neq 0 (
    echo ERROR: GUI build failed!
    pause
    exit /b 1
)

echo [2/4] Copying GUI assets to VSCode plugin...
cd /d "%ROOT%"
xcopy "%ROOT%gui\dist\*" "%ROOT%extensions\vscode\gui\" /E /Y /Q
echo   GUI assets copied.

echo [3/4] Building VSCode extension (esbuild + sqlite3 native)...
cd /d "%ROOT%extensions\vscode"
if not exist node_modules call npm install
node scripts/esbuild.js --minify
if %ERRORLEVEL% neq 0 (
    echo ERROR: esbuild failed!
    pause
    exit /b 1
)

rem Copy sqlite3 native module (pre-compiled binary in project root)
if not exist "out\Release" mkdir "out\Release"
set "SQLITE_SRC=%ROOT%build\Release\node_sqlite3.node"
if exist "%SQLITE_SRC%" (
    copy /Y "%SQLITE_SRC%" "out\Release\node_sqlite3.node" >nul
    echo   sqlite3 native module copied to out\Release\.
) else (
    echo   WARNING: sqlite3 native module not found at %SQLITE_SRC%
    echo   Run 'cd core ^&^& npm rebuild sqlite3' to build it.
)

echo [4/4] Packaging VSIX...
call npx vsce package --skip-license --no-dependencies
if %ERRORLEVEL% neq 0 (
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
