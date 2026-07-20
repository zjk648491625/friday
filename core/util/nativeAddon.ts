import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

const NATIVE_DIR = path.join(
  process.env.FRIDAY_DATA_DIR || path.join(os.homedir(), ".friday"),
  "native",
);

const VERSION = "0.4.20";
const INDEX_NODE = "index.node";

/**
 * 镜像源列表：国内镜像优先，官方源兜底。
 * 按顺序依次尝试，任一成功即停止。
 */
const REGISTRIES = [
  "https://registry.npmmirror.com", // 淘宝 / 阿里云 npmmirror
  "https://npm.aliyun.com", // 阿里云
  "https://mirrors.cloud.tencent.com/npm/", // 腾讯云
  "https://repo.huaweicloud.com/repository/npm/", // 华为云
  "https://registry.npmjs.org", // 官方源（兜底）
];

/**
 * 解析实际使用的镜像源列表。
 * 优先级：环境变量 FRIDAY_NPM_REGISTRY（手动指定，便于部署/调试）> 内置多镜像列表。
 */
function getRegistries(): string[] {
  const envRegistry = process.env.FRIDAY_NPM_REGISTRY?.trim();
  if (envRegistry) {
    console.log(
      `[nativeAddon] Using registry from FRIDAY_NPM_REGISTRY: ${envRegistry}`,
    );
    return [envRegistry];
  }
  return REGISTRIES;
}

/**
 * 根据当前运行环境探测对应的 LanceDB 原生模块三元组，
 * 例如 win32-x64-msvc / linux-x64-gnu / darwin-arm64 等。
 * 返回 null 表示当前平台不受支持。
 */
function detectTarget(): string | null {
  const platform = os.platform(); // "win32" | "linux" | "darwin" | ...
  const arch = os.arch(); // "x64" | "arm64" | ...

  if (platform === "win32") {
    if (arch === "x64") return "win32-x64-msvc";
    if (arch === "arm64") return "win32-arm64-msvc";
    return null;
  }

  if (platform === "darwin") {
    if (arch === "x64") return "darwin-x64";
    if (arch === "arm64") return "darwin-arm64";
    return null;
  }

  if (platform === "linux") {
    const libc = detectLibc(); // "gnu" | "musl"
    if (arch === "x64") return `linux-x64-${libc}`;
    if (arch === "arm64") return `linux-arm64-${libc}`;
    return null;
  }

  return null;
}

/**
 * 检测 Linux 使用的 C 标准库类型。
 * - glibc: 大多数发行版（Ubuntu/Debian/CentOS 等）
 * - musl:  Alpine 等轻量发行版
 */
function detectLibc(): "gnu" | "musl" {
  try {
    const out = execSync("ldd --version 2>&1 || true", { encoding: "utf8" });
    if (/musl/.test(out)) return "musl";
  } catch {
    // 忽略，继续走 process.report 检测
  }
  try {
    const report = (process as any).report?.getReport?.();
    if (report?.header && report.header.glibcVersionRuntime === undefined) {
      return "musl";
    }
  } catch {
    // 忽略
  }
  return "gnu";
}

let downloadPromise: Promise<boolean> | null = null;

export function getLanceDbNativePath(): string {
  return path.join(NATIVE_DIR, INDEX_NODE);
}

export function isLanceDbNativeAvailable(): boolean {
  return fs.existsSync(getLanceDbNativePath());
}

/**
 * 在宿主进程里可靠地定位 npm 可执行文件。
 * VSCode / IntelliJ 的扩展宿主进程往往 PATH 里没有 npm（尤其从 GUI 启动），
 * 直接 `npm` 会找不到；这里显式尝试常见位置。
 */
function findNpm(): string {
  const candidates = [
    "npm.cmd",
    "npm",
    process.env.NPM_CLI_PATH,
    `${process.env.LOCALAPPDATA}\\nvs\\default\\npm.cmd`,
    `${process.env.LOCALAPPDATA}\\nvs\\node\\20.20.1\\x64\\npm.cmd`,
    "C:\\Program Files\\nodejs\\npm.cmd",
    `${process.env.APPDATA}\\npm\\npm.cmd`,
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    try {
      execSync(`where "${c}"`, { stdio: "ignore" });
      return c;
    } catch {
      // 继续尝试下一个
    }
  }
  return "npm";
}

/**
 * 尝试从一个镜像源安装目标包到 workDir。
 * 成功返回 true，失败返回 false（不抛出）。会打印 npm 的完整 stdout/stderr 便于诊断。
 */
function tryInstallFromRegistry(
  pkg: string,
  registry: string,
  workDir: string,
): boolean {
  const npm = findNpm();
  try {
    console.log(`[nativeAddon] Trying registry: ${registry} (npm=${npm})`);
    execSync(
      `"${npm}" install ${pkg}@${VERSION} --no-save --prefix "${workDir}" --registry=${registry}`,
      {
        cwd: workDir,
        timeout: 300_000, // 5 min
        stdio: "pipe",
      },
    );
    return true;
  } catch (e: any) {
    console.error(
      `[nativeAddon] Registry ${registry} failed:`,
      e?.message || e,
      e?.stdout?.toString?.() || "",
      e?.stderr?.toString?.() || "",
    );
    return false;
  }
}

/**
 * 已下载的 vectordb 包入口文件（位于 ~/.friday/native/node_modules/vectordb）。
 *
 * 普通用户 / 打包插件通过 ensureLanceDbNative() 把**完整 vectordb 包**
 * （含平台原生子包 @lancedb/vectordb-<triple>）装到这里，这样 vectordb
 * 包装器内部的 require("@lancedb/vectordb-<triple>") 能在
 * ~/.friday/native/node_modules/ 目录下正确解析到原生模块，
 * 无需开发环境、也无需把原生模块打进插件。
 */
export function getDownloadedVectordbEntry(): string | null {
  const pkgDir = path.join(NATIVE_DIR, "node_modules", "vectordb");
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    return null;
  }
  let main = "index.js";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const exp = pkg.exports?.["."];
    if (typeof exp === "string") {
      main = exp;
    } else if (exp?.require) {
      main = exp.require;
    } else if (exp?.default) {
      main = exp.default;
    } else if (pkg.main) {
      main = pkg.main;
    }
  } catch {
    // 忽略，使用默认 main
  }
  const entry = path.join(pkgDir, main);
  if (fs.existsSync(entry)) {
    return entry;
  }
  const fallback = path.join(pkgDir, "index.js");
  return fs.existsSync(fallback) ? fallback : null;
}

export function isDownloadedVectordbAvailable(): boolean {
  return getDownloadedVectordbEntry() !== null;
}

function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

/**
 * npm 在扩展宿主进程里可能不可用（PATH 缺失等）。
 * 作为兜底，查找开发机 binary/node_modules 里已安装的完整 vectordb 包
 * （含平台原生子包 @lancedb/vectordb-<triple>），整体复制到
 * ~/.friday/native/node_modules/，使下载逻辑在 npm 不可用时也能工作。
 * 普通打包插件环境下该路径不存在，自动跳过、继续走 npm 下载。
 */
function tryCopyFromExistingVectordb(): boolean {
  // __dirname 在打包二进制里为 core/win32-x64/；回退三层到 binary/node_modules
  const srcModules = path.join(__dirname, "..", "..", "..", "node_modules");
  if (!fs.existsSync(path.join(srcModules, "vectordb", "package.json"))) {
    return false;
  }
  console.log(
    `[nativeAddon] npm unavailable, copying existing vectordb from ${srcModules}`,
  );
  copyDirRecursive(srcModules, path.join(NATIVE_DIR, "node_modules"));
  return true;
}

export function ensureLanceDbNative(): void {
  if (isDownloadedVectordbAvailable() || downloadPromise) return;

  const target = detectTarget();
  if (!target) {
    console.error(
      `[nativeAddon] Unsupported platform: ${os.platform()}-${os.arch()}. ` +
        `LanceDB native addon cannot be downloaded.`,
    );
    return;
  }
  // 安装完整 vectordb 包（其 optionalDependencies 会自动带上当前平台的
  // 原生子包 @lancedb/vectordb-<triple>），而非只下载裸 index.node。
  const pkg = "vectordb";

  downloadPromise = new Promise((resolve) => {
    let tmpDir: string | undefined;
    try {
      if (!fs.existsSync(NATIVE_DIR)) {
        fs.mkdirSync(NATIVE_DIR, { recursive: true });
      }

      // 使用临时工作目录，避免污染 native 目录
      tmpDir = fs.mkdtempSync(path.join(NATIVE_DIR, "tmp-"));

      // 写一个最小 package.json，避免某些 npm 在空目录里行为异常
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          name: "friday-lancedb-tmp",
          version: "1.0.0",
          private: true,
        }),
      );

      let installed = false;
      for (const registry of getRegistries()) {
        if (tryInstallFromRegistry(pkg, registry, tmpDir)) {
          installed = true;
          break;
        }
      }

      if (!installed) {
        // npm 在扩展宿主里可能不可用，作为兜底尝试复制本机已有的 vectordb 包
        if (tryCopyFromExistingVectordb()) {
          installed = true;
        } else {
          throw new Error(`Failed to install ${pkg} from all registries`);
        }
      }

      // 把整个 node_modules 复制到 ~/.friday/native/node_modules，
      // 使 vectordb 包装器内部的 require("@lancedb/vectordb-<triple>")
      // 能在该目录树下正确解析到原生模块（无需开发环境）。
      const srcModules = path.join(tmpDir, "node_modules");
      if (!fs.existsSync(srcModules)) {
        throw new Error(`node_modules not found in ${tmpDir}`);
      }
      const dstModules = path.join(NATIVE_DIR, "node_modules");
      copyDirRecursive(srcModules, dstModules);

      if (!isDownloadedVectordbAvailable()) {
        throw new Error(
          `vectordb not found at ${path.join(dstModules, "vectordb")} after install`,
        );
      }

      console.log(
        `[nativeAddon] LanceDB (${target}) installed to ${dstModules}`,
      );
      resolve(true);
    } catch (e: any) {
      console.error(
        "[nativeAddon] LanceDB install failed:",
        e?.message || e,
      );
      downloadPromise = null; // 允许下次重试
      resolve(false);
    } finally {
      // 清理临时目录（成功/失败都要清理）
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // 忽略清理失败
        }
      }
    }
  });
}
