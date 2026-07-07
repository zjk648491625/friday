// Fixup: friday-ai → fridayai in Kotlin/Java package names (hyphens are illegal)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const TARGET = 'd:/Microservice/friday/extensions/intellij';
const SKIP_DIRS = ['build', '.gradle', 'node_modules', '.git', '.run'];

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !SKIP_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
      walkDir(full, files);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (['.kt', '.java', '.xml', '.kts', '.properties', '.json', '.md', '.html'].includes(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

let fixed = 0;
for (const filepath of walkDir(TARGET)) {
  let content = readFileSync(filepath, 'utf-8');
  const original = content;

  // Fix broken package declarations (split by header insertion)
  // Pattern: package com.github.friday\n// header\n-ai.fridayintellijextension
  content = content.replace(
    /package com\.github\.friday\n\/\/ Modified by Friday AI Team - Rebranded from Continue\n-ai\.fridayintellijextension/g,
    '// Modified by Friday AI Team - Rebranded from Continue\npackage com.github.fridayai.fridayintellijextension'
  );

  // Fix friday-ai → fridayai in package declarations and imports (Kotlin/Java only)
  const ext = extname(filepath).toLowerCase();
  if (['.kt', '.java', '.xml', '.kts'].includes(ext)) {
    // Fix imports: import com.github.friday-ai.xxx → import com.github.fridayai.xxx
    content = content.replace(/import com\.github\.friday-ai\./g, 'import com.github.fridayai.');
    // Fix package: package com.github.friday-ai.xxx → package com.github.fridayai.xxx
    content = content.replace(/package com\.github\.friday-ai\./g, 'package com.github.fridayai.');
    // Fix class refs in XML: com.github.friday-ai.xxx → com.github.fridayai.xxx
    content = content.replace(/com\.github\.friday-ai\./g, 'com.github.fridayai.');
  }

  if (content !== original) {
    writeFileSync(filepath, content, 'utf-8');
    fixed++;
    console.log(`  FIXED: ${relative(TARGET, filepath)}`);
  }
}

console.log(`\nFixed ${fixed} files`);
