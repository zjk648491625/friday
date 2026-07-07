// Friday AI Rebrand Script - core/
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const TARGET = 'd:/Microservice/friday/core';
const SKIP_DIRS = ['node_modules', '.git'];
const SKIP_PATHS = [join(TARGET, 'protocol')]; // Skip entire protocol directory
const CODE_EXTS = ['.ts', '.js', '.tsx', '.jsx'];
const PROCESS_EXTS = ['.ts', '.js', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml'];

// These npm packages are project-internal; DO NOT replace @continuedev in imports 
// (package coordinates must match what's in package.json)
const PACKAGE_PREFIXES = ['@continuedev/', '@friday-ai/'];

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (full === join(TARGET, 'dist')) continue; // Skip dist
    if (SKIP_DIRS.includes(entry.name)) continue;
    if (SKIP_PATHS.some(p => full.startsWith(p + '/') || full === p)) continue;
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      walkDir(full, files);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (PROCESS_EXTS.includes(ext) || entry.name === '.eslintrc.json') {
        files.push(full);
      }
    }
  }
  return files;
}

// Protect @continuedev references in import paths
function protectPackages(content) {
  const placeholders = {};
  let idx = 0;
  // In import/require statements, @continuedev/x → placeholder
  const regex = /@continuedev\//g;
  content = content.replace(regex, (match) => {
    const ph = `__PKG_CONTINUEDEV_${idx}__`;
    placeholders[ph] = match;
    idx++;
    return ph;
  });
  return { content, placeholders };
}

function restorePackages(content, placeholders) {
  for (const [ph, orig] of Object.entries(placeholders)) {
    content = content.split(ph).join(orig);
  }
  return content;
}

let totalModified = 0;
let pkgProtected = 0;
const allFiles = walkDir(TARGET);

for (const filepath of allFiles) {
  try {
    let content = readFileSync(filepath, 'utf-8');
    const original = content;
    const ext = extname(filepath).toLowerCase();
    const isCode = CODE_EXTS.includes(ext);

    // Protect @continuedev package references
    const { content: protected_content, placeholders } = protectPackages(content);
    content = protected_content;
    pkgProtected += Object.keys(placeholders).length;

    // "continuedev" → "friday-ai" (for non-package references)
    content = content.split('continuedev').join('friday-ai');
    
    // "continue-dev" → "friday-ai"
    content = content.split('continue-dev').join('friday-ai');
    
    // "Continue Dev" → "Friday AI"
    content = content.split('Continue Dev').join('Friday AI');
    
    // "CONTINUE" → "FRIDAY"
    content = content.split('CONTINUE').join('FRIDAY');
    
    // "Continue" → "Friday"
    content = content.split('Continue').join('Friday');
    
    // "continue" → "friday" 
    content = content.split('continue').join('friday');

    // Restore @continuedev package references
    content = restorePackages(content, placeholders);

    // Add compliance header
    if (isCode && !content.startsWith('// Modified by Friday AI Team')) {
      content = '// Modified by Friday AI Team - Rebranded from Continue\n' + content;
    }

    if (content !== original) {
      writeFileSync(filepath, content, 'utf-8');
      totalModified++;
      console.log(`  OK: ${relative(TARGET, filepath)}`);
    }
  } catch (e) {
    console.error(`  ERR: ${relative(TARGET, filepath)} - ${e.message}`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Modified: ${totalModified} files`);
console.log(`Package refs protected: ${pkgProtected}`);
