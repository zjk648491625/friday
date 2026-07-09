@echo off
echo ========================================
echo   Friday IntelliJ Plugin Build Script
echo ========================================
echo.

echo [1/3] Building GUI frontend...
cd /d "%~dp0gui"
call npx vite build
if %ERRORLEVEL% neq 0 (
    echo ERROR: GUI build failed!
    pause
    exit /b 1
)

echo [2/3] Copying assets to plugin webview...
cd /d "%~dp0"
xcopy gui\dist\assets extensions\intellij\src\main\resources\webview\assets\ /E /Y /Q
if not exist "extensions\intellij\src\main\resources\webview\fonts" mkdir "extensions\intellij\src\main\resources\webview\fonts"
if not exist "extensions\intellij\src\main\resources\webview\logos" mkdir "extensions\intellij\src\main\resources\webview\logos"
copy /Y gui\dist\index.html extensions\intellij\src\main\resources\webview\index.html >nul
REM Inject JetBrains IDE detection for IntelliJ webview
powershell -Command "(Get-Content 'extensions\intellij\src\main\resources\webview\index.html') -replace '</head>', '<script>localStorage.setItem(\"ide\", \"jetbrains\");</script></head>' | Set-Content 'extensions\intellij\src\main\resources\webview\index.html'"
copy /Y gui\dist\indexConsole.html extensions\intellij\src\main\resources\webview\indexConsole.html >nul
copy /Y gui\dist\jetbrains_index.html extensions\intellij\src\main\resources\webview\jetbrains_index.html >nul
copy /Y gui\dist\jetbrains_editorInset_index.html extensions\intellij\src\main\resources\webview\jetbrains_editorInset_index.html >nul
xcopy gui\dist\fonts extensions\intellij\src\main\resources\webview\fonts\ /E /Y /Q
xcopy gui\dist\logos extensions\intellij\src\main\resources\webview\logos\ /E /Y /Q

echo [3/3] Building IntelliJ plugin...
cd /d "%~dp0extensions\intellij"
call gradlew buildPlugin
if %ERRORLEVEL% neq 0 (
    echo ERROR: Plugin build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   BUILD SUCCESSFUL!
echo ========================================
dir build\distributions\*.zip
pause
