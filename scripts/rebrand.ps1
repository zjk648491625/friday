param(
    [string]$TargetDir,
    [string]$CommitMsg
)

$ErrorActionPreference = "Continue"

# Exemption patterns (paths/files to skip entirely)
$SkipPaths = @(
    "build\", ".gradle\", "node_modules\", ".git\", "gradle-wrapper.jar",
    "NOTICE.original", "LICENSE.original"
)

# Exemption patterns for content within files (don't replace these)
# URLs and dependency coordinates
$ExemptPatterns = @(
    'url="https://www.continue.dev/"',
    'https://github.com/continuedev/continue',
    'https://docs.continue.dev',
    'api.continue.dev',
    'www.continue.dev',
    '@continuedev/fetch',
    '@continuedev/config-yaml',
    '@continuedev/config-types',
    '@continuedev/llm-info',
    '@continuedev/openai-adapters',
    '@continuedev/terminal-security',
    '@continuedev/fetch'
)

$FileExtensions = @("*.kt", "*.java", "*.ts", "*.tsx", "*.js", "*.jsx", "*.xml", 
                    "*.md", "*.html", "*.svg", "*.properties", "*.json", "*.kts",
                    "*.yml", "*.yaml", "*.py", "*.toml", "*.cfg")

$CodeFileExts = @(".kt", ".java", ".ts", ".tsx", ".py", ".js", ".jsx")

$TotalModified = 0
$TotalSkipped = 0
$SkippedFiles = @()

Write-Host "=== Friday AI Rebrand Script ===" -ForegroundColor Cyan
Write-Host "Target: $TargetDir" -ForegroundColor Cyan
Write-Host ""

$files = Get-ChildItem -Path $TargetDir -Recurse -File |
    Where-Object { 
        $ext = $_.Extension.ToLower()
        $full = $_.FullName.ToLower()
        $skip = $false
        foreach ($sp in $SkipPaths) {
            if ($full -like "*\$sp*") { $skip = $true; break }
        }
        return !$skip -and ($FileExtensions -contains "*$ext" -or $ext -in @(".kt",".java",".ts",".tsx",".js",".jsx",".xml",".md",".html",".svg",".properties",".json",".kts",".yml",".yaml",".py",".toml",".cfg"))
    }

foreach ($file in $files) {
    try {
        $content = [System.IO.File]::ReadAllText($file.FullName)
        $original = $content
        $modified = $false

        # Don't mess with core/protocol/ field names - skip JSON-RPC message types
        # (content-based exemption - only apply to protocol directory)
        $isProtocolDir = $file.FullName -match '[\\/]protocol[\\/]' -or $file.FullName -match '[\\/]core[\\/].*protocol'

        # === Replacements (case-sensitive, in order) ===
        
        # First, save exempt patterns by replacing with placeholders
        $placeholders = @{}
        $phCounter = 0
        foreach ($ep in $ExemptPatterns) {
            $ph = "___FRIDAY_AI_PLACEHOLDER_${phCounter}___"
            if ($content -match [regex]::Escape($ep)) {
                $placeholders[$ph] = $ep
                $content = $content -replace [regex]::Escape($ep), $ph
            }
            $phCounter++
        }
        
        # Also protect "continue" as a JS/TS/Kotlin keyword (standalone word "continue" in code)
        # Only apply this protection in code files, not in text/markdown
        
        # Replace "Continuedev" → "Fridayai" (rare, capital D)
        $newContent = $content -creplace 'Continuedev', 'Fridayai'
        
        # Replace "continue-dev" → "friday-ai"
        $newContent = $newContent -creplace 'continue-dev', 'friday-ai'
        
        # Replace "continuedev" → "friday-ai"
        $newContent = $newContent -creplace 'continuedev', 'friday-ai'
        
        # Replace "Continue Dev" → "Friday AI"
        $newContent = $newContent -creplace 'Continue Dev', 'Friday AI'
        
        # Replace "CONTINUE" → "FRIDAY"
        $newContent = $newContent -creplace 'CONTINUE', 'FRIDAY'
        
        # Replace "Continue" (capital C) → "Friday"
        $newContent = $newContent -creplace 'Continue', 'Friday'
        
        # For code files: Replace "continue" → "friday" only when it's in identifiers (preceded by . or in camelCase)
        # For non-code files: Replace all "continue" → "friday"
        $ext = $file.Extension.ToLower()
        if ($ext -in $CodeFileExts) {
            # In code files, "continue" might be a keyword. 
            # Match "continue" as part of identifiers (preceded by . _ or lowercase letter, followed by uppercase or .)
            $newContent = $newContent -creplace '(?<=\.)continue', 'friday'
            $newContent = $newContent -creplace '(?<=[a-z])continue(?=[A-Z])', 'friday'
            # Also match at start of variable names: word boundary
            $newContent = $newContent -creplace '\bcontinue(?=[A-Z])', 'friday'
        } else {
            # Text/markdown/XML/JSON: Replace all occurrences
            $newContent = $newContent -creplace 'continue', 'friday'
        }
        
        # Restore placeholders (exempt patterns)
        foreach ($ph in $placeholders.Keys) {
            $newContent = $newContent -replace $ph, $placeholders[$ph]
        }

        if ($newContent -ne $content) {
            # Add compliance header for code files
            $fileExt = $file.Extension.ToLower()
            if ($fileExt -in $CodeFileExts) {
                $header = "// Modified by Friday AI Team - Rebranded from Continue`r`n"
                # Check if file already has the header
                if (-not $newContent.StartsWith("// Modified by Friday AI Team")) {
                    # For Kotlin files, need to preserve package declaration at top
                    if ($fileExt -eq ".kt" -and $newContent -match '^(package\s+[\w.]+)') {
                        $pkgMatch = $Matches[1]
                        $newContent = $newContent -replace [regex]::Escape($pkgMatch), "$pkgMatch`r`n`r`n$header"
                    } else {
                        $newContent = $header + $newContent
                    }
                }
            }
            
            [System.IO.File]::WriteAllText($file.FullName, $newContent)
            $TotalModified++
            Write-Host "  MODIFIED: $($file.Name)" -ForegroundColor Green
        }
        
    } catch {
        Write-Host "  SKIPPED (error): $($file.Name) - $_" -ForegroundColor Red
        $TotalSkipped++
        $SkippedFiles += $file.FullName
    }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Modified: $TotalModified files" -ForegroundColor Green
Write-Host "Skipped: $TotalSkipped files" -ForegroundColor Yellow
if ($SkippedFiles.Count -gt 0) {
    Write-Host "Skipped files:" -ForegroundColor Yellow
    foreach ($sf in $SkippedFiles) {
        Write-Host "  $sf"
    }
}
