/**
 * i18n 批量替换脚本 — 只替换字典中已有的 key，安全不误伤
 * 用法: node scripts/i18n-batch.mjs          (自动执行)
 *       node scripts/i18n-batch.mjs --dry    (仅预览)
 *       node scripts/i18n-batch.mjs --undo   (回滚 .i18nbak)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GUI_SRC = path.join(ROOT, "gui", "src");
const I18N_FILE = path.join(GUI_SRC, "util", "i18n.ts");
const DRY_RUN = process.argv.includes("--dry");
const UNDO = process.argv.includes("--undo");

// ── 1. 读取翻译字典的所有 key ──
function loadDictKeys() {
  const code = fs.readFileSync(I18N_FILE, "utf8");
  // 匹配 "Key": "值" 格式的 key
  const keys = new Set();
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g;
  let m;
  while ((m = re.exec(code))) {
    const k = m[1];
    if (k && !k.startsWith("//") && !k.match(/^[\/\*]/)) {
      keys.add(k);
    }
  }
  // 手动补充不在字典但需要翻译的
  keys.delete("Settings"); // etc
  return Array.from(keys).filter(k => k.length > 1 && /[A-Z]/.test(k));
}

// ── 2. 判断相对 import 路径 ──
function getRelativeImport(filePath) {
  const rel = path.relative(path.dirname(filePath), path.join(GUI_SRC, "util", "i18n"));
  return rel.replace(/\\/g, "/").replace(/^([^./])/, "./$1");
}

// ── 3. 转义正则特殊字符 ──
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── 4. 主替换逻辑 ──
function processFile(filePath, dictKeys) {
  let code = fs.readFileSync(filePath, "utf8");
  let modified = false;
  let added = false;
  const importPath = getRelativeImport(filePath);

  // 检查当前是否已有 T 或 Tfmt 的 import
  const hasIMport = /import\s+\{\s*T\s*,/.test(code) || 
                    /import\s+\{\s*Tfmt/.test(code) ||
                    /import\s+\{\s*T\s+\}/.test(code) ||
                    /from\s+["'].*i18n["']/.test(code);

  // 排序 key 按长度降序，避免短 key 先匹配导致问题
  const sortedKeys = [...dictKeys].sort((a, b) => b.length - a.length);

  let replacements = 0;

  for (const key of sortedKeys) {
    if (key.length < 3) continue; // 太短容易误伤
    
    const escaped = escapeRegex(key);

    // Pattern 1: JSX 文本内容 <tag>Key</tag> → <tag>{T("Key")}</tag>
    const p1 = new RegExp(`>\\s*(${escaped})\\s*<`, "g");
    const new1 = code.replace(p1, (match, captured) => {
      replacements++;
      modified = true;
      return `>{T("${key}")}<`;
    });
    if (new1 !== code) code = new1;

    // Pattern 2: JSX 属性 title="Key" → title={T("Key")}
    const p2 = new RegExp(`(title|placeholder|content|label|description|tooltip|message|text|name)=["'](${escaped})["']`, "gi");
    const new2 = code.replace(p2, (match, attr, captured) => {
      if (!/["'{(`]/.test(match.slice(0, match.indexOf('=')))) { // 避免已处理
        replacements++;
        modified = true;
        return `${attr}={T("${key}")}`;
      }
      return match;
    });
    if (new2 !== code) code = new2;

    // Pattern 3: JSX 文本 <tag>{'Key'}</tag> 或 <tag>{"Key"}</tag> → <tag>{T("Key")}</tag>
    const p3 = new RegExp(`>\\{['"](${escaped})['"]\\}<`, "g");
    const new3 = code.replace(p3, (match) => {
      replacements++;
      modified = true;
      return `>{T("${key}")}<`;
    });
    if (new3 !== code) code = new3;

    // Pattern 4: tooltipContent="Key" → tooltipContent={T("Key")}
    // Pattern 5: 组件 props 中的字符串
    const p5 = new RegExp(`(tooltipContent|addButtonTooltip|hoverMessage)=["'](${escaped})["']`, "gi");
    const new5 = code.replace(p5, (match, attr) => {
      replacements++;
      modified = true;
      return `${attr}={T("${key}")}`;
    });
    if (new5 !== code) code = new5;
  }

  // 添加 import
  if (modified && !hasIMport) {
    // 找到最后一个 import 语句后插入
    const importMatch = code.match(/import\s+.*?;\n/g);
    if (importMatch && importMatch.length > 0) {
      const lastImport = importMatch[importMatch.length - 1];
      const lastIndex = code.lastIndexOf(lastImport) + lastImport.length;
      code = code.slice(0, lastIndex) + 
             `import { T } from "${importPath}";\n` + 
             code.slice(lastIndex);
      added = true;
    } else if (code.startsWith("//") || code.startsWith("/*")) {
      // 插入到注释之后
      const firstCode = code.search(/[a-zA-Z]/);
      code = code.slice(0, firstCode) + 
             `import { T } from "${importPath}";\n` + 
             code.slice(firstCode);
      added = true;
    }
  }

  return { code, modified, replacements, added };
}

// ── 5. 遍历所有文件 ──
function walkDir(dir, ext = [".tsx", ".ts"]) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...walkDir(full, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      files.push(full);
    }
  }
  return files;
}

// ── 6. Undo 还原 ──
function undoAll() {
  function walkAndRestore(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walkAndRestore(full);
      } else if (entry.name.endsWith(".i18nbak")) {
        const orig = full.replace(".i18nbak", "");
        fs.copyFileSync(full, orig);
        fs.unlinkSync(full);
        console.log(`  RESTORED: ${orig}`);
      }
    }
  }
  walkAndRestore(GUI_SRC);
}

// ── MAIN ──
if (UNDO) {
  console.log("🔄 Undoing all i18n changes...");
  undoAll();
  console.log("✅ Done.");
  process.exit(0);
}

console.log("📖 Loading dictionary...");
const dictKeys = loadDictKeys();
console.log(`   ${dictKeys.length} keys loaded`);

console.log("🔍 Scanning files...");
const allFiles = walkDir(GUI_SRC).filter(f => {
  const sep = path.sep;
  return f.includes(`${sep}components${sep}`) || 
         f.includes(`${sep}pages${sep}`) ||
         f.includes(`${sep}context${sep}`) ||
         f.includes(`${sep}redux${sep}`) ||
         f.includes(`${sep}hooks${sep}`);
});
console.log(`   ${allFiles.length} target files found`);

let totalModified = 0;
let totalReplacements = 0;
const dryMode = DRY_RUN ? " (DRY RUN)" : "";

for (const file of allFiles) {
  try {
    const result = processFile(file, dictKeys);
    if (result.modified) {
      totalModified++;
      totalReplacements += result.replacements;
      console.log(`  ${dryMode} ${path.relative(GUI_SRC, file)}: ${result.replacements} replacements${result.added ? ' +import' : ''}`);
      
      if (!DRY_RUN) {
        // 备份原文件
        fs.copyFileSync(file, file + ".i18nbak");
        fs.writeFileSync(file, result.code, "utf8");
      }
    }
  } catch (e) {
    console.error(`  ❌ ${file}: ${e.message}`);
  }
}

console.log(`\n📊 ${dryMode}Summary: ${totalModified} files, ${totalReplacements} replacements`);
if (DRY_RUN) {
  console.log("   Run without --dry to apply changes");
}
