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
if exist "%ROOT%binary\bin\win32-x64\friday-binary.js" (echo   Keeping friday-binary.js) else (echo   WARNING: friday-binary.js not found!)

echo [3/3] Building IntelliJ plugin...
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
