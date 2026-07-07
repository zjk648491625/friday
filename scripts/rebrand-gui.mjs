// Friday AI Rebrand Script - gui/
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const TARGET = 'd:/Microservice/friday/gui';
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next'];
const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];
const PROCESS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.svg'];

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (SKIP_DIRS.includes(entry.name)) continue;
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      walkDir(full, files);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (PROCESS_EXTS.includes(ext) || entry.name === 'vite.config.ts' || entry.name === 'tailwind.config.js') {
        files.push(full);
      }
    }
  }
  return files;
}

// Protect @continuedev package references in import paths
function protectPackages(content) {
  const placeholders = {};
  let idx = 0;
  const regex = /@continuedev\//g;
  content = content.replace(regex, (match) => {
    const ph = `__PKG_KEPT_${idx}__`;
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

    // "continuedev" → "friday-ai"
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
    if (isCode && !content.startsWith('// Modified by Friday AI Team') && !content.startsWith('/* Modified by Friday AI Team')) {
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
