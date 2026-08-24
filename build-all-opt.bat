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

:: --- CLI (default N) ---
choice /t 60 /d n /c yn /m "Build CLI? [Y/N] (default=N after 60s)"
if errorlevel 2 (echo [3/5] CLI: SKIPPED) else call :build_cli
echo.

:: --- IntelliJ (default N) ---
choice /t 60 /d n /c yn /m "Build IntelliJ Plugin? [Y/N] (default=N after 60s)"
if errorlevel 2 (echo [4/5] IntelliJ: SKIPPED) else call :build_intellij
echo.

:: --- VSCode (default N) ---
choice /t 60 /d n /c yn /m "Build VSCode Plugin? [Y/N] (default=N after 60s)"
if errorlevel 2 (echo [5/5] VSCode: SKIPPED) else call :build_vscode
echo.

goto :done

:auto_build
echo ==================================================
echo   Friday Build -a (auto all, no prompts)
echo ==================================================
echo.

:: Clean caches first
echo [CLEAN] Removing caches...
if exist "%ROOT%gui\node_modules\.vite" rmdir /s /q "%ROOT%gui\node_modules\.vite"
if exist "%ROOT%gui\dist" rmdir /s /q "%ROOT%gui\dist"
if exist "%ROOT%extensions\intellij\build" rmdir /s /q "%ROOT%extensions\intellij\build"
if exist "%CORE_OUT%\index.js" del /f /q "%CORE_OUT%\index.js"
:: Clean package dist directories
for %%p in (config-yaml config-types fetch openai-adapters llm-info terminal-security) do (
    if exist "%ROOT%packages\%%p\dist" rmdir /s /q "%ROOT%packages\%%p\dist"
)
:: Clean CLI dist
if exist "%ROOT%extensions\cli\dist" rmdir /s /q "%ROOT%extensions\cli\dist"
:: Clean core dist
if exist "%ROOT%core\dist" rmdir /s /q "%ROOT%core\dist"
echo [CLEAN] Done.
echo.

call :build_core
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_gui
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_cli
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_intellij
if !ERRORLEVEL! neq 0 goto :done
echo.
call :build_vscode
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

:build_packages
echo [PKG] Building dependent packages (topological order)...
for %%p in (config-types llm-info terminal-security) do (
    echo   Building packages/%%p...
    cd /d "%ROOT%packages\%%p"
    if not exist node_modules call npm install
    call npx tsc
    if !ERRORLEVEL! neq 0 (
        echo   [%%p] Build FAILED!
        pause
        exit /b 1
    )
    echo   %%p built OK.
)
for %%p in (config-yaml fetch) do (
    echo   Building packages/%%p...
    cd /d "%ROOT%packages\%%p"
    if not exist node_modules call npm install
    call npx tsc
    if !ERRORLEVEL! neq 0 (
        echo   [%%p] Build FAILED!
        pause
        exit /b 1
    )
    echo   %%p built OK.
)
echo   Building packages/openai-adapters...
cd /d "%ROOT%packages\openai-adapters"
if not exist node_modules call npm install
call npx tsc
if !ERRORLEVEL! neq 0 (
    echo   [openai-adapters] Build FAILED!
    pause
    exit /b 1
)
echo   openai-adapters built OK.
echo [PKG] All packages built.
goto :eof

:build_core
echo [1/5] Building Core...
echo [Core] Step 0/2: Building dependent packages first...
call :build_packages
if !ERRORLEVEL! neq 0 exit /b 1
echo [Core] Step 1/2: Compiling TypeScript (core -> core/dist)...
cd /d "%ROOT%core"
if not exist node_modules call npm install
call npm run build
if !ERRORLEVEL! neq 0 (
    echo [Core] TypeScript compilation FAILED!
    pause
    exit /b 1
)
echo [Core] Step 2/2: Bundling binary (binary/out + binary/bin)...
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
:: Copy sqlite3 native binding if present
if exist "%ROOT%binary\node_modules\sqlite3\build\Release\node_sqlite3.node" (
    if not exist "%CORE_BIN%\build\Release" mkdir "%CORE_BIN%\build\Release"
    copy /Y "%ROOT%binary\node_modules\sqlite3\build\Release\node_sqlite3.node" "%CORE_BIN%\build\Release\node_sqlite3.node" >nul
)
:: Create a minimal package.json so the 'bindings' npm package resolves
:: module_root to the core binary directory instead of the project root.
if not exist "%CORE_BIN%\package.json" (
    echo {"name":"friday-core","version":"1.0.0"}> "%CORE_BIN%\package.json"
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

rem ---------------------------------------------------------------------------
rem Detect a JDK 17+ for the Gradle daemon.
rem
rem Probe order (first match wins):
rem   1. FRIDAY_JDK_HOME environment variable (explicit override)
rem   2. IntelliJ IDEA bundled JBR (IDEA_HOME\jbr, LOCALAPPDATA install dirs)
rem   3. Common install locations under Program Files, Eclipse Adoptium,
rem      Microsoft, Zulu, and C:\soft\Java / D:\soft\Java / %%USERPROFILE%%\.jdks
rem   4. PATH `where java` reverse lookup (java.exe -> bin -> jdk home)
rem   5. Current JAVA_HOME, if it is already 17+
rem ---------------------------------------------------------------------------

set "FRIDAY_JDK_HOME_FOUND="

rem --- 1. Explicit override via FRIDAY_JDK_HOME ---
if defined FRIDAY_JDK_HOME (
    if exist "%FRIDAY_JDK_HOME%\bin\java.exe" (
        set "FRIDAY_JDK_HOME_FOUND=%FRIDAY_JDK_HOME%"
        call :validate_jdk "%FRIDAY_JDK_HOME_FOUND%"
        if "!FRIDAY_JDK_VALID!"=="0" (
            echo [JDK] FRIDAY_JDK_HOME=%FRIDAY_JDK_HOME% is not JDK 17+, skipping...
            set "FRIDAY_JDK_HOME_FOUND="
        )
    )
)

rem --- 2. IntelliJ IDEA bundled JBR ---
if not defined FRIDAY_JDK_HOME_FOUND (
    if defined IDEA_HOME (
        if exist "%IDEA_HOME%\jbr\bin\java.exe" (
            set "FRIDAY_JDK_HOME_FOUND=%IDEA_HOME%\jbr"
            call :validate_jdk "%FRIDAY_JDK_HOME_FOUND%"
            if "!FRIDAY_JDK_VALID!"=="0" set "FRIDAY_JDK_HOME_FOUND="
        )
    )
)
if not defined FRIDAY_JDK_HOME_FOUND (
    if defined IDEA_JBR (
        if exist "%IDEA_JBR%\bin\java.exe" (
            set "FRIDAY_JDK_HOME_FOUND=%IDEA_JBR%"
            call :validate_jdk "%FRIDAY_JDK_HOME_FOUND%"
            if "!FRIDAY_JDK_VALID!"=="0" set "FRIDAY_JDK_HOME_FOUND="
        )
    )
)
if not defined FRIDAY_JDK_HOME_FOUND (
    if defined LOCALAPPDATA (
        for /d %%D in ("%LOCALAPPDATA%\Programs\IntelliJ IDEA*\jbr") do (
            if not defined FRIDAY_JDK_HOME_FOUND if exist "%%D\bin\java.exe" (
                set "FRIDAY_JDK_HOME_FOUND=%%D"
                call :validate_jdk "%%D"
                if "!FRIDAY_JDK_VALID!"=="0" set "FRIDAY_JDK_HOME_FOUND="
            )
        )
    )
)

rem --- 3. Common install locations ---
if not defined FRIDAY_JDK_HOME_FOUND (
    for %%R in (
        "C:\Program Files\Java"
        "C:\Program Files\Eclipse Adoptium"
        "C:\Program Files\Microsoft"
        "C:\Program Files\Zulu"
        "C:\Program Files\Amazon Corretto"
        "C:\soft\Java"
        "D:\soft\Java"
        "%USERPROFILE%\.jdks"
    ) do (
        if not defined FRIDAY_JDK_HOME_FOUND if exist "%%~R" (
            for /d %%D in ("%%~R\jdk-17*" "%%~R\jdk17*" "%%~R\jbr-17*") do (
                if not defined FRIDAY_JDK_HOME_FOUND if exist "%%D\bin\java.exe" (
                    set "FRIDAY_JDK_HOME_FOUND=%%D"
                    call :validate_jdk "%%D"
                    if "!FRIDAY_JDK_VALID!"=="0" set "FRIDAY_JDK_HOME_FOUND="
                )
            )
        )
    )
)

rem --- 4. PATH `where java` reverse lookup ---
if not defined FRIDAY_JDK_HOME_FOUND (
    set "WHERE_JAVA_LINE="
    for /f "usebackq delims=" %%L in (`where java 2^>nul`) do (
        if not defined WHERE_JAVA_LINE set "WHERE_JAVA_LINE=%%L"
    )
    if defined WHERE_JAVA_LINE (
        for %%F in ("%WHERE_JAVA_LINE%") do set "WHERE_JAVA_BIN=%%~dpF"
        if "!WHERE_JAVA_BIN:~-1!"=="\" set "WHERE_JAVA_BIN=!WHERE_JAVA_BIN:~0,-1!"
        for %%P in ("!WHERE_JAVA_BIN!") do set "WHERE_JAVA_HOME=%%~dpP"
        if "!WHERE_JAVA_HOME:~-1!"=="\" set "WHERE_JAVA_HOME=!WHERE_JAVA_HOME:~0,-1!"
        if exist "!WHERE_JAVA_HOME!\bin\java.exe" (
            set "FRIDAY_JDK_HOME_FOUND=!WHERE_JAVA_HOME!"
            call :validate_jdk "!WHERE_JAVA_HOME!"
            if "!FRIDAY_JDK_VALID!"=="0" (
                echo [JDK] PATH java is at !WHERE_JAVA_HOME! but it is not JDK 17+, skipping...
                set "FRIDAY_JDK_HOME_FOUND="
            )
        )
    )
)

rem --- 5. Current JAVA_HOME (validated with java -version) ---
if not defined FRIDAY_JDK_HOME_FOUND (
    if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" (
        set "FRIDAY_JDK_HOME_FOUND=%JAVA_HOME%"
        call :validate_jdk "%JAVA_HOME%"
        if "!FRIDAY_JDK_VALID!"=="0" (
            echo [JDK] JAVA_HOME=%JAVA_HOME% is not JDK 17+, skipping...
            set "FRIDAY_JDK_HOME_FOUND="
        )
    )
)

if not defined FRIDAY_JDK_HOME_FOUND (
    echo ERROR: No JDK 17+ found for the Gradle daemon.
    echo.
    echo Fix one of the following and re-run:
    echo   - Set FRIDAY_JDK_HOME to a JDK 17+ install dir
    echo   - Install a JDK 17+ under C:\Program Files\Java\jdk-17 or similar
    echo   - Set JAVA_HOME to a JDK 17+ ^(will be detected automatically^)
    pause
    exit /b 1
)

if /i not "%JAVA_HOME%"=="%FRIDAY_JDK_HOME_FOUND%" (
    echo [JDK] Using JDK at: %FRIDAY_JDK_HOME_FOUND%
    set "JAVA_HOME=%FRIDAY_JDK_HOME_FOUND%"
)

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
echo [CLI] Building CLI...
call "%ROOT%build-cli.bat"
if !ERRORLEVEL! neq 0 (
    echo [CLI] SKIPPED
    goto :eof
)
echo [CLI] Copying CLI dist to binary output...
if not exist "%ROOT%extensions\cli\dist\friday.js" (
    echo [CLI] WARNING: CLI dist not found at extensions\cli\dist\friday.js
    goto :eof
)
if not exist "%CORE_BIN%\cli" mkdir "%CORE_BIN%\cli"
xcopy "%ROOT%extensions\cli\dist\*" "%CORE_BIN%\cli\" /E /Y /Q
echo [CLI] Done.
goto :eof

rem ---------------------------------------------------------------------------
rem Validate that a JDK home is actually Java 17+
rem
rem Usage: call :validate_jdk "C:\path\to\jdk"
rem Returns: FRIDAY_JDK_VALID = 1 (valid) or 0 (invalid)
rem ---------------------------------------------------------------------------
:validate_jdk
set "FRIDAY_JDK_VALID=0"
if "%~1"=="" exit /b
if not exist "%~1\bin\java.exe" exit /b

rem java -version writes to stderr; redirect to stdout, capture first line with "version"
"%~1\bin\java.exe" -version 2>&1 | findstr /i "version" > "%TEMP%\friday_jdk_ver.txt"
for /f "usebackq tokens=1-3 delims= " %%a in ("%TEMP%\friday_jdk_ver.txt") do (
    set "JDK_VER_RAW=%%~c"
)
del "%TEMP%\friday_jdk_ver.txt" 2>nul

if not defined JDK_VER_RAW exit /b

rem Extract major version: "17.0.2" -> 17, "1.8.0_202" -> 8
for /f "tokens=1 delims=." %%a in ("!JDK_VER_RAW!") do set "JDK_MAJOR=%%a"

rem Pre-Java 9 uses "1.X" format; extract the second token as major
if "!JDK_MAJOR!"=="1" (
    for /f "tokens=2 delims=." %%a in ("!JDK_VER_RAW!") do set "JDK_MAJOR=%%a"
)

if !JDK_MAJOR! geq 17 set "FRIDAY_JDK_VALID=1"
exit /b