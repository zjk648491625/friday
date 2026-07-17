@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "ROOT=%~dp0"
set "CORE_BIN=%ROOT%binary\bin\win32-x64"
set "CORE_OUT=%ROOT%binary\out"
set "BUNDLE=%ROOT%binary\bin\out"

:: Check for -a / --all flag
set "AUTO=0"
if /i "%~1"=="-a" set "AUTO=1"
if /i "%~1"=="--all" set "AUTO=1"
if "!AUTO!"=="1" goto :auto_build

echo ==================================================
echo   Friday Build (60s timeout, default shown as [Y/N]?D)
echo ==================================================
echo.

:: --- Clean (default N) ---
choice /t 60 /d n /c yn /m "Clear caches? [Y/N] (default=N after 60s)"
if errorlevel 2 (echo [CLEAN] Skipped.) else (
    echo [CLEAN] Removing caches...
    if exist "%ROOT%gui\node_modules\.vite" rmdir /s /q "%ROOT%gui\node_modules\.vite"
    if exist "%ROOT%gui\dist" rmdir /s /q "%ROOT%gui\dist"
    if exist "%ROOT%extensions\intellij\build" rmdir /s /q "%ROOT%extensions\intellij\build"
    if exist "%CORE_OUT%\index.js" del /f /q "%CORE_OUT%\index.js"
    echo [CLEAN] Done.
)
echo.

:: --- Core (default Y) ---
choice /t 60 /d y /c yn /m "Build Core? [Y/N] (default=Y after 60s)"
if errorlevel 2 (echo [1/5] Core: SKIPPED) else call :build_core
echo.

:: --- GUI (default Y) ---
choice /t 60 /d y /c yn /m "Build GUI? [Y/N] (default=Y after 60s)"
if errorlevel 2 (echo [2/5] GUI: SKIPPED) else call :build_gui
echo.

:: --- IntelliJ (default N) ---
choice /t 60 /d n /c yn /m "Build IntelliJ Plugin? [Y/N] (default=N after 60s)"
if errorlevel 2 (echo [3/5] IntelliJ: SKIPPED) else call :build_intellij
echo.

:: --- VSCode (default N) ---
choice /t 60 /d n /c yn /m "Build VSCode Plugin? [Y/N] (default=N after 60s)"
if errorlevel 2 (echo [4/5] VSCode: SKIPPED) else call :build_vscode
echo.

:: --- CLI (default N) ---
choice /t 60 /d n /c yn /m "Build CLI? [Y/N] (default=N after 60s)"
if errorlevel 2 (echo [5/5] CLI: SKIPPED) else call :build_cli
echo.

goto :done

:auto_build
echo ==================================================
echo   Friday Build -a (auto all, no prompts)
echo ==================================================
echo.
call :build_core
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_gui
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_intellij
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_vscode
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_cli
if !ERRORLEVEL! neq 0 goto :done

:done

echo ==================================================
echo   BUILD COMPLETE
echo ==================================================
endlocal
if "!AUTO!"=="0" pause
exit /b 0

:: =============================================
:: SUBROUTINES
:: =============================================

:build_core
echo [1/5] Building Core...
cd /d "%ROOT%binary"
if not exist node_modules call npm install
node build.js --esbuild-only
if not exist "%CORE_OUT%\index.js" (
    echo [Core] FAILED! Binary output not found.
    pause
    exit /b 1
)
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
goto :eof

:build_gui
echo [2/5] Building GUI...
cd /d "%ROOT%gui"
call npx vite build
if !ERRORLEVEL! neq 0 (
    echo [GUI] FAILED!
    pause
    exit /b 1
)
echo [GUI] Done.
goto :eof

:build_intellij
echo [3/5] Copying GUI assets to IntelliJ...
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
if !ERRORLEVEL! neq 0 (
    echo [IntelliJ] FAILED!
    pause
    exit /b 1
)
echo [IntelliJ] Done.
dir "%ROOT%extensions\intellij\build\distributions\*.zip" 2>nul
goto :eof

:build_vscode
echo [4/5] Building VSCode plugin...
cd /d "%ROOT%extensions\vscode"
call npm install

echo   [4.1] Copying GUI assets...
cd /d "%ROOT%"
xcopy "%ROOT%gui\dist\*" "%ROOT%extensions\vscode\gui\" /E /Y /Q

echo   [4.2] Building extension (esbuild)...
cd /d "%ROOT%extensions\vscode"
node scripts/esbuild.js --minify
if !ERRORLEVEL! neq 0 (
    echo [VSCode] esbuild FAILED!
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

echo   [4.3] Packaging VSIX...
call npx vsce package --skip-license --no-dependencies
if !ERRORLEVEL! neq 0 (
    echo [VSCode] VSIX packaging FAILED!
    pause
    exit /b 1
)
echo [VSCode] Done.
dir "%ROOT%extensions\vscode\friday-ai-*.vsix" 2>nul
goto :eof

:build_cli
echo [5/5] Building CLI...
call "%ROOT%build-cli.bat"
if !ERRORLEVEL! neq 0 (
    echo [CLI] SKIPPED
)
goto :eof
