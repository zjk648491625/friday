import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";

const NATIVE_DIR = path.join(
  process.env.FRIDAY_DATA_DIR || path.join(os.homedir(), ".friday"),
  "native",
);

const TARGET = "win32-x64-msvc";
const VERSION = "0.4.20";
const INDEX_NODE = "index.node";

let downloadPromise: Promise<boolean> | null = null;

export function getLanceDbNativePath(): string {
  return path.join(NATIVE_DIR, INDEX_NODE);
}

export function isLanceDbNativeAvailable(): boolean {
  return fs.existsSync(getLanceDbNativePath());
}

/** Get the shell command to install LanceDB native addon */
export function getLanceDbInstallCommand(): string {
  return `cd /d "%USERPROFILE%\\.friday" && if not exist "native" mkdir "native" && cd /d "%USERPROFILE%\\.friday\\native" && npm init -y >nul 2>&1 && npm install @lancedb/vectordb-${TARGET}@${VERSION} --registry=https://registry.npmmirror.com --no-optional && copy /Y "node_modules\\@lancedb\\vectordb-${TARGET}\\${INDEX_NODE}" "${INDEX_NODE}" >nul && echo [OK] LanceDB installed && rmdir /s /q "node_modules" 2>nul && del package.json 2>nul && del package-lock.json 2>nul`;
}

export function ensureLanceDbNative(): void {
  if (isLanceDbNativeAvailable() || downloadPromise) return;

  downloadPromise = new Promise((resolve) => {
    if (!fs.existsSync(NATIVE_DIR)) {
      fs.mkdirSync(NATIVE_DIR, { recursive: true });
    }

    const cmd = getLanceDbInstallCommand();
    exec(cmd, { timeout: 180_000, windowsHide: true }, (error, stdout) => {
      if (error) {
        console.error("[nativeAddon] LanceDB install failed:", error.message);
        downloadPromise = null;
        resolve(false);
        return;
      }
      console.log("[nativeAddon] LanceDB install OK:", stdout.trim());
      resolve(true);
    });
  });
}
