import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const NATIVE_DIR = path.join(
  process.env.FRIDAY_DATA_DIR || path.join(os.homedir(), ".friday"),
  "native",
);

const TARGET = "win32-x64-msvc";
const VERSION = "0.4.20";
const INDEX_NODE = "index.node";
const PACKAGE = `@lancedb/vectordb-${TARGET}`;

let downloadPromise: Promise<boolean> | null = null;

export function getLanceDbNativePath(): string {
  return path.join(NATIVE_DIR, INDEX_NODE);
}

export function isLanceDbNativeAvailable(): boolean {
  return fs.existsSync(getLanceDbNativePath());
}

export function ensureLanceDbNative(): void {
  if (isLanceDbNativeAvailable() || downloadPromise) return;

  downloadPromise = new Promise((resolve) => {
    try {
      if (!fs.existsSync(NATIVE_DIR)) {
        fs.mkdirSync(NATIVE_DIR, { recursive: true });
      }
      const cwd = NATIVE_DIR;
      console.log(`[nativeAddon] Downloading ${PACKAGE}@${VERSION} to ${cwd} ...`);

      // Step 1: install package
      execSync(`npm install ${PACKAGE}@${VERSION} --no-optional --no-save`, {
        cwd,
        timeout: 300_000, // 5 min
        stdio: "pipe",
        env: { ...process.env, npm_config_registry: "https://registry.npmjs.org" },
      });

      // Step 2: find and copy index.node
      const moduleDir = path.join(cwd, "node_modules", PACKAGE);
      if (!fs.existsSync(moduleDir)) {
        throw new Error(`Package not found: ${moduleDir}`);
      }

      const src = path.join(moduleDir, INDEX_NODE);
      if (!fs.existsSync(src)) {
        const files = fs.readdirSync(moduleDir).join(", ");
        throw new Error(`index.node not found in ${moduleDir}. Contents: ${files}`);
      }

      const dst = path.join(cwd, INDEX_NODE);
      fs.copyFileSync(src, dst);
      fs.rmSync(path.join(cwd, "node_modules"), { recursive: true, force: true });
      try { fs.unlinkSync(path.join(cwd, "package.json")); } catch {}
      try { fs.unlinkSync(path.join(cwd, "package-lock.json")); } catch {}

      const size = (fs.statSync(dst).size / 1024 / 1024).toFixed(1);
      console.log(`[nativeAddon] LanceDB installed: ${dst} (${size}MB)`);
      resolve(true);
    } catch (e: any) {
      console.error("[nativeAddon] LanceDB install failed:", e?.message || e);
      downloadPromise = null;
      resolve(false);
    }
  });
}
