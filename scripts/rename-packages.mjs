// Rename @continuedev/* → @friday-ai/* in ALL files across the project
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

function walk(dir, files = [], skip = ['node_modules', '.git', 'dist', 'build', 'out', '.gradle', 'target', '.next']) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (skip.includes(e.name) || e.name.startsWith('.')) continue;
    if (e.isDirectory()) walk(f, files);
    else if (e.isFile()) {
      const x = extname(e.name);
      if (['.ts','.tsx','.js','.jsx','.json','.md','.yaml','.yml','.html'].includes(x))
        files.push(f);
    }
  }
  return files;
}

const ROOTS = [
  'd:/Microservice/friday/extensions',
  'd:/Microservice/friday/core',
  'd:/Microservice/friday/gui',
  'd:/Microservice/friday/packages',
  'd:/Microservice/friday/binary',
  'd:/Microservice/friday/scripts',
];

let total = 0;
for (const root of ROOTS) {
  for (const f of walk(root)) {
    try {
      let s = readFileSync(f, 'utf8');
      const orig = s;
      s = s.split('@continuedev/').join('@friday-ai/');
      if (s !== orig) {
        writeFileSync(f, s);
        total++;
        console.log('OK: ' + relative('d:/Microservice/friday', f));
      }
    } catch (e) {
      console.error('ERR: ' + f + ' - ' + e.message);
    }
  }
}
console.log('\nTotal: ' + total + ' files updated');
