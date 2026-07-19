@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ========================================
echo   Friday CLI Build Script
echo ========================================

echo [1/3] Building config-yaml (packages/config-yaml)...
cd /d "%ROOT%packages\config-yaml"
call npm install
echo   Building config-yaml...
call npx tsc
if !ERRORLEVEL! neq 0 (
    echo   [config-yaml] Build FAILED!
    cd /d "%ROOT%"
    endlocal
    exit /b 1
)
echo   config-yaml built OK.

echo [2/3] Building SDK (packages/sdk/typescript)...
cd /d "%ROOT%packages\sdk\typescript"
call npm install

:: Build API sub-package
cd api
call npm install
echo   Building API...
call npx tsc
if !ERRORLEVEL! neq 0 goto :sdk_err
call npx tsc -p tsconfig.esm.json
if !ERRORLEVEL! neq 0 goto :sdk_err
cd ..

:: Pre-link config-yaml AFTER npm install (npm removes extraneous links)
rmdir /s /q "node_modules\@friday-ai" 2>nul
mkdir "node_modules\@friday-ai" 2>nul
mklink /J "node_modules\@friday-ai\config-yaml" "%ROOT%packages\config-yaml" >nul 2>&1

:: Build SDK
echo   Building SDK...
call npx tsc
if !ERRORLEVEL! neq 0 goto :sdk_err

:: Create dist structure
if not exist "dist\api\dist" mkdir "dist\api\dist"
xcopy "api\dist\*" "dist\api\dist\" /E /Y /Q >nul
copy /Y "api\package.json" "dist\api\package.json" >nul

echo   SDK built OK.
goto :build_cli

:sdk_err
echo   [SDK] Build FAILED!
cd /d "%ROOT%"
endlocal
exit /b 1

:build_cli
echo [3/3] Building CLI (extensions/cli)...
cd /d "%ROOT%extensions\cli"

:: npm 10.x file: dep bug on Windows -> install with minimal package.json
echo   Installing CLI deps...
if not exist "node_modules\esbuild\package.json" (
    echo     Clean reinstalling...
    rmdir /s /q node_modules 2>nul
    if exist package.json.bak move /Y package.json.bak package.json >nul
    move package.json package.json.bak >nul
    echo {"name":"tmp","type":"module","dependencies":{"esbuild":"^0.25.9","ink":"^6","react":"^19","winston":"^3","node-machine-id":"^1","@opentelemetry/api":"^1","@opentelemetry/exporter-metrics-otlp-http":"^0","@opentelemetry/resources":"^2","@opentelemetry/sdk-metrics":"^0","@opentelemetry/semantic-conventions":"^1","dotenv":"^16","express":"^5","chalk":"^5","commander":"^14","cors":"^2","strip-ansi":"^7","uuid":"^9","yaml":"^2","date-fns":"^4","fkill":"^8","swr":"^2","glob":"^11","handlebars":"^4","turndown":"^7","open":"^10","execa":"^9","gradient-string":"^3","nock":"^14","@modelcontextprotocol/sdk":"^1","gpt-tokenizer":"^3","fdir":"^6","fzf":"^0","lowlight":"^3","diff":"^8","ignore-walk":"^7"}} > package.json
    call npm install --ignore-scripts --legacy-peer-deps --no-package-lock >nul 2>&1
    move /Y package.json.bak package.json >nul
)

:: Create junctions AFTER npm install (npm removes extraneous links)
if not exist "node_modules\@friday-ai" mkdir "node_modules\@friday-ai"
for %%p in (sdk config-yaml openai-adapters config-types fetch llm-info terminal-security) do (
    if exist "%ROOT%packages\%%p\package.json" (
        rmdir "node_modules\@friday-ai\%%p" 2>nul
        mklink /J "node_modules\@friday-ai\%%p" "%ROOT%packages\%%p" >nul 2>&1
    )
)

echo   Building CLI...
call npm run build
if !ERRORLEVEL! neq 0 (
    echo   [CLI] Build FAILED!
    cd /d "%ROOT%"
    endlocal
    exit /b 1
)

echo.
echo ========================================
echo   CLI BUILD SUCCESSFUL!
echo ========================================
cd /d "%ROOT%"
endlocal
exit /b 0
