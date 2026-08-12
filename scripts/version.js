const fs = require("fs");
const path = require("path");

function generateTimestampVersion() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yy}${mm}${dd}${hh}${min}${ss}`;
}

let _cachedVersion = null;

function getBuildVersion() {
  if (!_cachedVersion) {
    _cachedVersion = generateTimestampVersion();
  }
  return _cachedVersion;
}

function resetBuildVersion() {
  _cachedVersion = null;
}

const REPO_ROOT = path.resolve(__dirname, "..");

const PACKAGE_JSON_PATHS = [
  "packages/openai-adapters/package.json",
  "packages/config-types/package.json",
  "packages/config-yaml/package.json",
  "packages/fetch/package.json",
  "packages/llm-info/package.json",
  "packages/terminal-security/package.json",
  "packages/sdk/package.json",
  "packages/sdk/typescript/package.json",
  "packages/sdk/typescript/api/package.json",
  "core/package.json",
  "gui/package.json",
  "extensions/cli/package.json",
  "extensions/vscode/package.json",
  "binary/package.json",
  "binary/pkgJson/win32-x64/package.json",
  "binary/pkgJson/win32-arm64/package.json",
  "binary/pkgJson/linux-x64/package.json",
  "binary/pkgJson/linux-arm64/package.json",
  "binary/pkgJson/darwin-x64/package.json",
  "binary/pkgJson/darwin-arm64/package.json",
];

function setVersionForBuild() {
  const version = getBuildVersion();
  const results = [];
  for (const relPath of PACKAGE_JSON_PATHS) {
    const filePath = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(filePath)) {
      results.push({ path: relPath, status: "skipped", reason: "not found" });
      continue;
    }
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const oldVersion = content.version;
      if (oldVersion === version) {
        results.push({ path: relPath, status: "unchanged", version });
        continue;
      }
      content.version = version;
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
      results.push({ path: relPath, old: oldVersion, new: version, status: "updated" });
    } catch (e) {
      results.push({ path: relPath, status: "error", reason: e.message });
    }
  }
  console.log(`[version] Set unified build version: ${version}`);
  for (const r of results) {
    if (r.status === "updated") {
      console.log(`  ${r.path}: ${r.old} -> ${r.new}`);
    } else {
      console.log(`  ${r.path}: ${r.status} (${r.reason || r.version || ""})`);
    }
  }
  return { version, results };
}

function setVersionForPackage(packageJsonPath) {
  const version = getBuildVersion();
  const filePath = path.resolve(REPO_ROOT, packageJsonPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`[version] Package not found: ${packageJsonPath}`);
    return null;
  }
  try {
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const oldVersion = content.version;
    if (oldVersion === version) {
      console.log(`[version] ${packageJsonPath}: unchanged (${version})`);
      return version;
    }
    content.version = version;
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    console.log(`[version] ${packageJsonPath}: ${oldVersion} -> ${version}`);
    return version;
  } catch (e) {
    console.error(`[version] Failed to update ${packageJsonPath}: ${e.message}`);
    return null;
  }
}

module.exports = {
  generateTimestampVersion,
  getBuildVersion,
  resetBuildVersion,
  setVersionForBuild,
  setVersionForPackage,
  PACKAGE_JSON_PATHS,
  REPO_ROOT,
};