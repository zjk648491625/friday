// Friday AI Rebrand Script - packages/
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const TARGET = 'd:/Microservice/friday/packages';
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build'];
const PROCESS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.yaml', '.yml'];
const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (SKIP_DIRS.includes(entry.name) || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (PROCESS_EXTS.includes(ext)) files.push(full);
    }
  }
  return files;
}

// Protect @continuedev in import/require - these are package coordinates
function protectPkg(content) {
  const phMap = {};
  let idx = 0;
  content = content.replace(/@continuedev\//g, (m) => {
    const ph = `__PKG_PROT_${idx}__`;
    phMap[ph] = m;
    idx++;
    return ph;
  });
  return { content, phMap };
}

function restorePkg(content, phMap) {
  for (const [ph, orig] of Object.entries(phMap)) {
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

    const { content: pc, phMap } = protectPkg(content);
    content = pc;

    content = content.split('continuedev').join('friday-ai');
    content = content.split('continue-dev').join('friday-ai');
    content = content.split('Continue Dev').join('Friday AI');
    content = content.split('CONTINUE').join('FRIDAY');
    content = content.split('Continue').join('Friday');
    content = content.split('continue').join('friday');

    content = restorePkg(content, phMap);

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
