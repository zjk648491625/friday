// Final rebrand: extensions/cli, binary, scripts, sync
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, extname, relative } from 'path';

const DIRS = [
  'd:/Microservice/friday/extensions/cli',
  'd:/Microservice/friday/binary',
  'd:/Microservice/friday/scripts',
  'd:/Microservice/friday/sync',
];
const SKIP = ['node_modules', '.git', 'dist', 'build', '.gradle', 'out', 'target'];
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.rs', '.toml', '.sh'];
const CODE = ['.ts', '.tsx', '.js', '.jsx', '.rs'];

function walk(dir, files = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const fp = join(dir, e.name);
    if (SKIP.includes(e.name)) continue;
    if (e.isDirectory() && !e.name.startsWith('.')) walk(fp, files);
    else if (e.isFile() && EXTS.includes(extname(e.name).toLowerCase())) files.push(fp);
  }
  return files;
}

function protect(c) {
  const m = {}; let i = 0;
  c = c.replace(/@continuedev\//g, x => { const k = '_P' + i + '_'; m[k] = x; i++; return k; });
  return { c, m };
}
function restore(c, m) {
  for (const [k, v] of Object.entries(m)) c = c.split(k).join(v);
  return c;
}

let total = 0;
for (const dir of DIRS) {
  for (const f of walk(dir)) {
    try {
      let s = readFileSync(f, 'utf8');
      const orig = s;
      const isCode = CODE.includes(extname(f).toLowerCase());
      const { c: pc, m } = protect(s);
      s = pc;
      s = s.split('continuedev').join('friday-ai');
      s = s.split('continue-dev').join('friday-ai');
      s = s.split('Continue Dev').join('Friday AI');
      s = s.split('CONTINUE').join('FRIDAY');
      s = s.split('Continue').join('Friday');
      s = s.split('continue').join('friday');
      s = restore(s, m);
      if (isCode && !s.startsWith('// Modified by Friday AI Team'))
        s = '// Modified by Friday AI Team - Rebranded from Continue\n' + s;
      if (s !== orig) { writeFileSync(f, s); total++; console.log('OK: ' + relative('d:/Microservice/friday', f)); }
    } catch (e) { console.error('ERR: ' + f + ' - ' + e.message); }
  }
}
console.log('\nTotal: ' + total);
