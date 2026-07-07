// Friday AI Rebrand Script - extensions/intellij
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, relative } from 'path';

const TARGET = 'd:/Microservice/friday/extensions/intellij';
const SKIP_DIRS = ['build', '.gradle', 'node_modules', '.git', '.run'];
const CODE_EXTS = ['.kt', '.java', '.js', '.ts', '.tsx', '.py'];
const PROCESS_EXTS = ['.kt', '.java', '.xml', '.md', '.html', '.kts', '.properties', '.json', '.yml', '.yaml', '.py', '.ts', '.tsx', '.js'];

// Patterns to protect (exempt from replacement)
const EXEMPT_URLS = [
  'https://www.continue.dev/',
  'https://github.com/continuedev/continue',
  'https://docs.continue.dev',
  'api.continue.dev',
];

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
        walkDir(full, files);
      }
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (PROCESS_EXTS.includes(ext) || entry.name === 'gradlew' || entry.name === 'gradle.properties') {
        files.push(full);
      }
    }
  }
  return files;
}

function protectExempt(content) {
  const placeholders = {};
  let idx = 0;
  for (const url of EXEMPT_URLS) {
    const ph = `__EXEMPT_URL_${idx}__`;
    if (content.includes(url)) {
      placeholders[ph] = url;
      content = content.split(url).join(ph);
    }
    idx++;
  }
  return { content, placeholders };
}

function restoreExempt(content, placeholders) {
  for (const [ph, orig] of Object.entries(placeholders)) {
    content = content.split(ph).join(orig);
  }
  return content;
}

function isThirdPartyDependency(line, filepath) {
  // Skip third-party dependency coordinates in build files
  if (filepath.endsWith('build.gradle.kts') || filepath.endsWith('settings.gradle.kts')) {
    // This is a dependency declaration: implementation("com.xxx:yyy") or similar
    if (line.includes('implementation(') || line.includes('api(') || 
        line.includes('testImplementation(') || line.includes('compileOnly(') ||
        line.includes('runtimeOnly(') || line.includes('classpath(')) {
      if (line.includes('"') && line.includes(':')) {
        return true; // This is a Maven/Gradle coordinate
      }
    }
  }
  return false;
}

let totalModified = 0;
const skipped = [];

const allFiles = walkDir(TARGET);

for (const filepath of allFiles) {
  try {
    let content = readFileSync(filepath, 'utf-8');
    const original = content;
    const ext = extname(filepath).toLowerCase();
    const isCode = CODE_EXTS.includes(ext);
    const isBuildFile = filepath.endsWith('build.gradle.kts') || filepath.endsWith('settings.gradle.kts');

    // Protect exempt patterns
    const { content: protected_content, placeholders } = protectExempt(content);
    content = protected_content;

    // Handle build files carefully - skip dependency coordinates
    if (isBuildFile) {
      const lines = content.split('\n');
      const newLines = [];
      for (const line of lines) {
        if (isThirdPartyDependency(line, filepath)) {
          newLines.push(line);
        } else {
          let l = line;
          l = l.replace(/Continue/g, 'Friday');
          l = l.replace(/CONTINUE/g, 'FRIDAY');
          l = l.replace(/continuedev/g, 'friday-ai');
          l = l.replace(/continue-dev/g, 'friday-ai');
          // In non-dependency lines: continue → friday
          l = l.replace(/continue/g, 'friday');
          newLines.push(l);
        }
      }
      content = newLines.join('\n');
    } else {
      // Order matters: do longer/more specific patterns first
      
      // "continuedev" → "friday-ai" (must come before "continue" → "friday")
      content = content.split('continuedev').join('friday-ai');
      
      // "continue-dev" → "friday-ai"
      content = content.split('continue-dev').join('friday-ai');
      
      // "Continue Dev" → "Friday AI" (must come before "Continue" → "Friday")
      content = content.split('Continue Dev').join('Friday AI');
      
      // "CONTINUE" → "FRIDAY" 
      content = content.split('CONTINUE').join('FRIDAY');
      
      // "Continue" → "Friday" (capital C)
      content = content.split('Continue').join('Friday');
      
      // "continue" → "friday" (lowercase)
      content = content.split('continue').join('friday');
    }

    // Restore exempt patterns
    content = restoreExempt(content, placeholders);

    // Add compliance header for code files
    if (isCode && !content.startsWith('// Modified by Friday AI Team')) {
      const header = '// Modified by Friday AI Team - Rebranded from Continue\n';
      // For Kotlin: keep package declaration first
      if (ext === '.kt' || ext === '.java') {
        const pkgMatch = content.match(/^(package\s+[\w.]+)/m);
        if (pkgMatch) {
          const pkg = pkgMatch[1];
          content = content.replace(pkg, pkg + '\n' + header);
        } else {
          content = header + content;
        }
      } else {
        content = header + content;
      }
    }

    if (content !== original) {
      writeFileSync(filepath, content, 'utf-8');
      totalModified++;
      console.log(`  OK: ${relative(TARGET, filepath)}`);
    }
  } catch (e) {
    skipped.push({ file: relative(TARGET, filepath), error: e.message });
    console.error(`  ERR: ${relative(TARGET, filepath)} - ${e.message}`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Modified: ${totalModified} files`);
console.log(`Skipped: ${skipped.length} files`);
if (skipped.length > 0) skipped.forEach(s => console.log(`  ${s.file}: ${s.error}`));
