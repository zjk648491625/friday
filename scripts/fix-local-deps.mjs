// Fix @friday-ai/* deps: remote version → local file: reference
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, relative, dirname } from 'path';

function walk(dir, files = [], skip = ['node_modules', 'dist', 'build', '.git']) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, e.name);
    if (skip.includes(e.name)) continue;
    if (e.isDirectory()) walk(fp, files);
    else if (e.name === 'package.json') files.push(fp);
  }
  return files;
}

const PKG_DIR = 'd:/Microservice/friday/packages';
const names = ['config-types', 'config-yaml', 'fetch', 'llm-info', 'openai-adapters', 'terminal-security'];
let count = 0;

for (const f of walk(PKG_DIR)) {
  let s = readFileSync(f, 'utf8');
  const orig = s;
  const dir = dirname(f);

  for (const name of names) {
    // Match "@friday-ai/NAME": "^X.Y.Z" (registry) → "file:RELATIVE_PATH"
    const re = new RegExp(`"@friday-ai/${name}":\\s*"\\^[\\d.]+"`, 'g');
    s = s.replace(re, () => {
      const rel = relative(dir, join(PKG_DIR, name)).replace(/\\/g, '/');
      return `"@friday-ai/${name}": "file:${rel}"`;
    });
  }

  if (s !== orig) {
    writeFileSync(f, s);
    count++;
    console.log('FIX: ' + relative('d:/Microservice/friday', f));
  }
}

// Also fix core/package.json
let s2 = readFileSync('d:/Microservice/friday/core/package.json', 'utf8');
const orig2 = s2;
for (const name of names) {
  const re = new RegExp(`"@friday-ai/${name}":\\s*"[^"]+"`, 'g');
  s2 = s2.replace(re, () => `"@friday-ai/${name}": "file:../packages/${name}"`);
}
if (s2 !== orig2) { writeFileSync('d:/Microservice/friday/core/package.json', s2); count++; console.log('FIX: core/package.json'); }

console.log('\nFixed: ' + count + ' files');
