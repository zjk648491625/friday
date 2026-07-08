cmd// Fix JS/TS continue keyword replacements (friday; → continue;)
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, extname, relative } from 'path';

function walk(dir, files = [], skip = ['node_modules', 'dist', 'build', '.git', '.gradle']) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, e.name);
    if (skip.includes(e.name) || e.name.startsWith('.')) continue;
    if (e.isDirectory()) walk(fp, files, skip);
    else {
      const x = extname(e.name);
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(x)) files.push(fp);
    }
  }
  return files;
}

const DIRS = ['packages', 'core', 'gui', 'extensions', 'binary'];
const BASE = 'd:/Microservice/friday';
let count = 0;

for (const d of DIRS) {
  for (const f of walk(join(BASE, d))) {
    let s = readFileSync(f, 'utf8');
    const orig = s;
    // Fix `friday;` → `continue;` (JS keyword - not preceded by . or word char)
    s = s.replace(/(?<![.\w])\bfriday;( \/\/.*)?$/gm, 'continue;$1');
    if (s !== orig) { writeFileSync(f, s); count++; console.log('FIX: ' + relative(BASE, f)); }
  }
}
console.log('\nFixed: ' + count + ' files');
