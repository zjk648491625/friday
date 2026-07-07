// Rename filesystem paths: continue → friday, Continue → Friday
import { readdirSync, renameSync, existsSync, statSync } from 'fs';
import { join, dirname, basename, relative, extname } from 'path';

const BASE = 'd:/Microservice/friday/extensions/intellij/src';

function walk(dir, list = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { walk(full, list); list.push({ type: 'dir', path: full }); }
    else list.push({ type: 'file', path: full });
  }
  return list;
}

// Also handle the top-level 'continuedev' in the extended path
// Path: src/main/kotlin/com/github/continuedev/continueintellijextension/...
// We need to rename 'continuedev' → 'fridayai' in the dir structure

function walkAll(dir, list = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory() && !['build','.gradle','node_modules'].includes(e.name)) {
      list.push({ type: 'dir', path: full });
      walkAll(full, list);
    }
  }
  return list;
}

const items = walkAll(BASE);
// Sort by depth descending (children before parents)
items.sort((a, b) => b.path.split('\\').length - a.path.split('\\').length);

const renames = [];
for (const item of items) {
  const name = basename(item.path);
  let newName = name;
  // Only rename if it contains brand identifiers
  if (name.includes('continue') || name.includes('Continue')) {
    newName = newName.split('Continue').join('Friday');
    newName = newName.split('continue').join('friday');
  }
  if (newName !== name) {
    const newPath = join(dirname(item.path), newName);
    if (!existsSync(newPath)) {
      renames.push({ from: item.path, to: newPath });
    }
  }
}

console.log(`Planned renames: ${renames.length}`);
for (const r of renames) {
  console.log(`  ${relative(BASE, r.from)}`);
  console.log(`    → ${relative(BASE, r.to)}`);
}

// Execute
let count = 0;
for (const r of renames) {
  try {
    renameSync(r.from, r.to);
    count++;
  } catch (e) {
    console.error(`  FAIL: ${r.from} - ${e.message}`);
  }
}
console.log(`\nRenamed: ${count} items`);
