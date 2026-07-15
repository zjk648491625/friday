@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "ROOT=%~dp0"
set "CORE_BIN=%ROOT%binary\bin\win32-x64"
set "CORE_OUT=%ROOT%binary\out"
set "BUNDLE=%ROOT%binary\bin\out"

echo ==================================================
echo   Friday Build (press y/n, 60s timeout = default)
echo ==================================================
echo.

:: --- Clean (default n) ---
choice /t 60 /d n /c yn /m "Clear caches?"
if errorlevel 2 (echo [CLEAN] Skipped.) else (
    echo [CLEAN] Removing caches...
    if exist "%ROOT%gui\node_modules\.vite" rmdir /s /q "%ROOT%gui\node_modules\.vite"
    if exist "%ROOT%gui\dist" rmdir /s /q "%ROOT%gui\dist"
    if exist "%ROOT%extensions\intellij\build" rmdir /s /q "%ROOT%extensions\intellij\build"
    if exist "%CORE_OUT%\index.js" del /f /q "%CORE_OUT%\index.js"
    echo [CLEAN] Done.
)
echo.

:: --- Core (default y) ---
choice /t 60 /d y /c yn /m "Build Core?"
if errorlevel 2 (echo [1/5] Core: SKIPPED) else (
    echo [1/5] Building Core...
    cd /d "%ROOT%binary"
    if not exist node_modules call npm install
    node build.js --esbuild-only
    if not exist "%CORE_OUT%\index.js" (echo [Core] FAILED! & pause & exit /b 1)
    if not exist "%BUNDLE%" mkdir "%BUNDLE%"
    copy /Y "%CORE_OUT%\index.js" "%BUNDLE%\index.js" >nul
    if not exist "%CORE_BIN%" mkdir "%CORE_BIN%"
    copy /Y "%CORE_OUT%\index.js" "%CORE_BIN%\friday-binary.js" >nul
    for %%f in (llamaTokenizerWorkerPool.mjs tiktokenWorkerPool.mjs xhr-sync-worker.js index.node) do (
        if exist "%CORE_OUT%\%%f" copy /Y "%CORE_OUT%\%%f" "%CORE_BIN%\%%f" >nul
    )
    if exist "%BUNDLE%" rmdir /s /q "%BUNDLE%"
    if not exist "%CORE_BIN%\rg.exe" (
        if exist "%ROOT%extensions\vscode\node_modules\@vscode\ripgrep\bin\rg.exe" (
            copy /Y "%ROOT%extensions\vscode\node_modules\@vscode\ripgrep\bin\rg.exe" "%CORE_BIN%\rg.exe" >nul
        )
    )
    if exist "%CORE_BIN%\index.node" del /f /q "%CORE_BIN%\index.node"
    if exist "%CORE_BIN%\friday-binary.exe" del /f /q "%CORE_BIN%\friday-binary.exe"
    if exist "%CORE_BIN%\out" rmdir /s /q "%CORE_BIN%\out"
    echo [Core] Done.
)
echo.

:: --- GUI (default y) ---
choice /t 60 /d y /c yn /m "Build GUI?"
if errorlevel 2 (echo [2/5] GUI: SKIPPED) else (
    echo [2/5] Building GUI...
    cd /d "%ROOT%gui"
    call npx vite build
    if !ERRORLEVEL! neq 0 (echo GUI FAILED! & pause & exit /b 1)
    echo [GUI] Done.
)
echo.

:: --- IntelliJ (default y) ---
choice /t 60 /d y /c yn /m "Build IntelliJ Plugin?"
if errorlevel 2 (echo [3/5] IntelliJ: SKIPPED) else (
    echo [3/5] Copying GUI to IntelliJ...
    cd /d "%ROOT%"
    xcopy "%ROOT%gui\dist\assets" "%ROOT%extensions\intellij\src\main\resources\webview\assets\" /E /Y /Q
    if not exist "%ROOT%extensions\intellij\src\main\resources\webview\fonts" mkdir "%ROOT%extensions\intellij\src\main\resources\webview\fonts"
    if not exist "%ROOT%extensions\intellij\src\main\resources\webview\logos" mkdir "%ROOT%extensions\intellij\src\main\resources\webview\logos"
    copy /Y "%ROOT%gui\dist\play_button.png" "%ROOT%extensions\intellij\src\main\resources\webview\play_button.png" >nul
    copy /Y "%ROOT%gui\dist\index.html" "%ROOT%extensions\intellij\src\main\resources\webview\index.html" >nul
    powershell -Command "(Get-Content '%ROOT%extensions\intellij\src\main\resources\webview\index.html') -replace '</head>', '<script>localStorage.setItem(\"ide\", JSON.stringify(\"jetbrains\"));</script></head>' | Set-Content '%ROOT%extensions\intellij\src\main\resources\webview\index.html'"
    copy /Y "%ROOT%gui\dist\indexConsole.html" "%ROOT%extensions\intellij\src\main\resources\webview\indexConsole.html" >nul
    copy /Y "%ROOT%gui\dist\jetbrains_index.html" "%ROOT%extensions\intellij\src\main\resources\webview\jetbrains_index.html" >nul
    copy /Y "%ROOT%gui\dist\jetbrains_editorInset_index.html" "%ROOT%extensions\intellij\src\main\resources\webview\jetbrains_editorInset_index.html" >nul
    xcopy "%ROOT%gui\dist\fonts" "%ROOT%extensions\intellij\src\main\resources\webview\fonts\" /E /Y /Q
    xcopy "%ROOT%gui\dist\logos" "%ROOT%extensions\intellij\src\main\resources\webview\logos\" /E /Y /Q
    echo [3/5] Building IntelliJ plugin...
    cd /d "%ROOT%extensions\intellij"
    call gradlew buildPlugin
    if !ERRORLEVEL! neq 0 (echo IntelliJ FAILED! & pause & exit /b 1)
    echo [IntelliJ] Done.
    dir "%ROOT%extensions\intellij\build\distributions\*.zip" 2>nul
)
echo.

:: --- VSCode (default n) ---
choice /t 60 /d n /c yn /m "Build VSCode Plugin?"
if errorlevel 2 (echo [4/5] VSCode: SKIPPED) else (
    echo [4/5] Building VSCode plugin...
    cd /d "%ROOT%extensions\vscode"
    if not exist node_modules call npm install
    call npx vsce package
    if !ERRORLEVEL! neq 0 (echo VSCode FAILED! & pause & exit /b 1)
    echo [VSCode] Done.
)
echo.

:: --- CLI (default n) ---
choice /t 60 /d n /c yn /m "Build CLI?"
if errorlevel 2 (echo [5/5] CLI: SKIPPED) else (
    echo [5/5] Building CLI...
    cd /d "%ROOT%extensions\cli"
    if not exist node_modules call npm install
    call npm run build
    if !ERRORLEVEL! neq 0 (echo CLI FAILED! & pause & exit /b 1)
    echo [CLI] Done.
)
echo.

echo ==================================================
echo   BUILD COMPLETE
echo ==================================================
endlocal
pause
