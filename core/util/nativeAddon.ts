import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { get } from "https";
import { createWriteStream } from "fs";

const NATIVE_DIR = path.join(
  process.env.FRIDAY_DATA_DIR || path.join(os.homedir(), ".friday"),
  "native",
);

const TARGET = "win32-x64-msvc";
const VERSION = "0.4.20";
const INDEX_NODE = "index.node";

// CDN mirrors for direct .node file download
const DOWNLOAD_URLS = [
  `https://cdn.jsdelivr.net/npm/@lancedb/vectordb-${TARGET}@${VERSION}/${INDEX_NODE}`,
  `https://unpkg.com/@lancedb/vectordb-${TARGET}@${VERSION}/${INDEX_NODE}`,
];

let downloadPromise: Promise<boolean> | null = null;

export function getLanceDbNativePath(): string {
  return path.join(NATIVE_DIR, INDEX_NODE);
}

export function isLanceDbNativeAvailable(): boolean {
  return fs.existsSync(getLanceDbNativePath());
}

/**
 * Trigger async download in background. Non-blocking.
 */
export function ensureLanceDbNative(): void {
  if (isLanceDbNativeAvailable() || downloadPromise) return;

  downloadPromise = downloadLanceDbNative()
    .then((ok) => {
      console.log(`[nativeAddon] LanceDB download ${ok ? "OK" : "FAILED"}`);
      return ok;
    })
    .catch((err) => {
      console.error("[nativeAddon] LanceDB download error:", (err as Error).message);
      downloadPromise = null;
      return false;
    });
}

async function downloadLanceDbNative(): Promise<boolean> {
  if (!fs.existsSync(NATIVE_DIR)) {
    fs.mkdirSync(NATIVE_DIR, { recursive: true });
  }

  const dest = getLanceDbNativePath();
  const tmp = dest + ".tmp";

  for (const url of DOWNLOAD_URLS) {
    try {
      await downloadFile(url, tmp);
      if (fs.existsSync(tmp) && fs.statSync(tmp).size > 1_000_000) {
        fs.renameSync(tmp, dest);
        return true;
      }
    } catch (e) {
      // try next mirror
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
  return false;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const req = get(url, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        downloadFile(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error("download timeout"));
    });
  });
}
