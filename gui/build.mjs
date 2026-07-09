import { build } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname);

console.log('Building GUI from', root);

try {
  await build({ root });
  console.log('BUILD COMPLETE');
  process.exit(0);
} catch (e) {
  console.error('BUILD FAILED:', e);
  process.exit(1);
}
