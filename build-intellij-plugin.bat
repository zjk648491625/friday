@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"

set NO_CACHE=0
if "%~1"=="" goto :start
if /i "%~1"=="-c" set NO_CACHE=1
if /i "%~1"=="--clean" set NO_CACHE=1

:start
echo ========================================
echo   Friday IntelliJ Plugin Build Script
echo ========================================

if %NO_CACHE%==1 (
    echo [CLEAN] Cleaning caches...
    if exist "%ROOT%gui\node_modules\.vite" rmdir /s /q "%ROOT%gui\node_modules\.vite"
    if exist "%ROOT%gui\dist" rmdir /s /q "%ROOT%gui\dist"
    if exist "%ROOT%extensions\intellij\build" rmdir /s /q "%ROOT%extensions\intellij\build"
    echo [CLEAN] Done.
)

echo [0/3] Building Core binary...
cd /d "%ROOT%binary"
if not exist node_modules call npm install
node build.js --esbuild-only
if %ERRORLEVEL% neq 0 (
    echo ERROR: Core build failed!
    pause
    exit /b 1
)

echo [1/3] Building GUI frontend...
cd /d "%ROOT%gui"
call npx vite build
if %ERRORLEVEL% neq 0 (
    echo ERROR: GUI build failed!
    pause
    exit /b 1
)

echo [2/3] Copying assets to plugin webview...
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

echo [2.5/3] Removing unnecessary binary files...
if exist "%ROOT%binary\bin\win32-x64\friday-binary.exe" del "%ROOT%binary\bin\win32-x64\friday-binary.exe"
rem Remove duplicate out/ directories (same files as in bin/win32-x64/)
if exist "%ROOT%binary\out" rmdir /s /q "%ROOT%binary\out"
if exist "%ROOT%binary\bin\out" rmdir /s /q "%ROOT%binary\bin\out"
if exist "%ROOT%binary\bin\win32-x64\friday-binary.js" (echo   Keeping friday-binary.js) else (echo   WARNING: friday-binary.js not found!)

echo [3/3] Building IntelliJ plugin...

rem ---------------------------------------------------------------------------
rem Detect a JDK 17+ for the Gradle daemon.
rem
rem The intellij-platform-gradle-plugin:2.7.2 requires the Gradle daemon to
rem run on JVM 17+. The developer's global JAVA_HOME may stay on JDK 8 for
rem other tooling, so we probe several sources in priority order and only
rem override JAVA_HOME inside this script's process (the global env var is
rem left untouched).
rem
rem Probe order (first match wins):
rem   1. FRIDAY_JDK_HOME environment variable (explicit override)
rem   2. IntelliJ IDEA bundled JBR (IDEA_HOME\jbr, LOCALAPPDATA install dirs)
rem   3. Common install locations under Program Files, Eclipse Adoptium,
rem      Microsoft, Zulu, and C:\soft\Java / D:\soft\Java / %USERPROFILE%\.jdks
rem   4. PATH `where java` reverse lookup (java.exe -> bin -> jdk home)
rem   5. Current JAVA_HOME, if it is already 17+
rem
rem If no JDK 17+ is found, we fail fast with actionable guidance instead of
rem letting Gradle emit obscure plugin-resolution errors.
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
    rem IntelliJ IDEA Community / Ultimate installed in LocalAppData
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
    rem Probe each well-known root for a child whose name starts with jdk-17 or jdk17.
    rem Roots are listed one per line; we iterate with a for loop.
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
rem where java prints each java.exe on PATH (one per line). We take the first,
rem go up two levels (java.exe -> bin -> jdk home), and verify java.exe exists
rem there. This catches the case where PATH points at a JDK 17 the user forgot
rem to set JAVA_HOME for.
if not defined FRIDAY_JDK_HOME_FOUND (
    set "WHERE_JAVA_LINE="
    for /f "usebackq delims=" %%L in (`where java 2^>nul`) do (
        if not defined WHERE_JAVA_LINE set "WHERE_JAVA_LINE=%%L"
    )
    if defined WHERE_JAVA_LINE (
        rem WHERE_JAVA_LINE is the java.exe path. Walk up to its grandparent.
        for %%F in ("%WHERE_JAVA_LINE%") do set "WHERE_JAVA_BIN=%%~dpF"
        rem Trim trailing backslash from bin dir, then go up one level.
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

rem --- Apply override or fail fast ---
rem If JAVA_HOME is already set to the discovered JDK, no override needed.
rem Otherwise, set JAVA_HOME for this process only (global env untouched).

if not defined FRIDAY_JDK_HOME_FOUND (
    echo ERROR: No JDK 17+ found for the Gradle daemon.
    echo.
    echo The intellij-platform-gradle-plugin:2.7.2 requires the Gradle daemon
    echo to run on JVM 17+. Probed the following sources without success:
    echo   1. FRIDAY_JDK_HOME environment variable
    echo   2. IntelliJ IDEA bundled JBR ^(IDEA_HOME\jbr, %LOCALAPPDATA%\Programs\IntelliJ IDEA*\jbr^)
    echo   3. Common install dirs ^(C:\Program Files\Java, Eclipse Adoptium, Microsoft, Zulu, soft\Java, %%USERPROFILE%%\.jdks^)
    echo   4. PATH `where java` reverse lookup
    echo   5. Current JAVA_HOME
    echo.
    echo Fix one of the following and re-run:
    echo   - Set FRIDAY_JDK_HOME to a JDK 17+ install dir
    echo   - Install a JDK 17+ under C:\Program Files\Java\jdk-17 or similar
    echo   - Set JAVA_HOME to a JDK 17+ ^(will be detected automatically^)
    pause
    exit /b 1
)

rem Only override JAVA_HOME if it differs from what we found, so we don't
rem clobber a JAVA_HOME that is already correct.
if /i not "%JAVA_HOME%"=="%FRIDAY_JDK_HOME_FOUND%" (
    echo [JDK] Using JDK at: %FRIDAY_JDK_HOME_FOUND%
    set "JAVA_HOME=%FRIDAY_JDK_HOME_FOUND%"
)

cd /d "%ROOT%extensions\intellij"
if %NO_CACHE%==1 (
    call gradlew clean buildPlugin --no-configuration-cache
) else (
    call gradlew buildPlugin
)
if %ERRORLEVEL% neq 0 (
    echo ERROR: Plugin build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BUILD SUCCESSFUL!
echo ========================================
dir "%ROOT%extensions\intellij\build\distributions\*.zip"
endlocal
exit /b 0

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