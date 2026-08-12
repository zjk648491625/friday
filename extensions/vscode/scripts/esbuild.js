const fs = require("fs");

const { writeBuildTimestamp } = require("./utils");
const { generateTimestampVersion } = require("../../../scripts/version");

const esbuild = require("esbuild");

const flags = process.argv.slice(2);

const BUILD_VERSION = generateTimestampVersion();
console.log(`[info] Build version: ${BUILD_VERSION}`);

const esbuildConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: [
    "vscode",
    "esbuild",
    "./xhr-sync-worker.js",
    "lru-cache",
  ],
  format: "cjs",
  platform: "node",
  sourcemap: flags.includes("--sourcemap"),
  loader: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ".node": "file",
  },

  // To allow import.meta.path for transformers.js
  // https://github.com/evanw/esbuild/issues/1492#issuecomment-893144483
  inject: ["./scripts/importMetaUrl.js"],
  define: {
      "import.meta.url": "importMetaUrl",
      "process.env.FRIDAY_BUILD_VERSION": JSON.stringify(BUILD_VERSION),
    },
  supported: { "dynamic-import": false },
  metafile: true,
  plugins: [
    {
      name: "on-end-plugin",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) {
            console.error("Build failed with errors:", result.errors);
            throw new Error(result.errors);
          } else {
            try {
              if (!fs.existsSync("./build")) {
                fs.mkdirSync("./build", { recursive: true });
              }
              fs.writeFileSync(
                "./build/meta.json",
                JSON.stringify(result.metafile, null, 2),
              );
            } catch (e) {
              console.error("Failed to write esbuild meta file", e);
            }

            // Copy sqlite3 native binding to out/Release/ for VSIX packaging
            const path = require("path");
            const sqlite3Node = path.join(
              __dirname, "..", "..", "..", "build", "Release", "node_sqlite3.node",
            );
            const destDir = path.join(__dirname, "..", "out", "Release");
            const dest = path.join(destDir, "node_sqlite3.node");
            if (fs.existsSync(sqlite3Node)) {
              if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(sqlite3Node, dest);
              console.log("Copied sqlite3 native binding (1.81MB) to out/Release/");
            } else {
              console.warn("sqlite3 binding not found at:", sqlite3Node);
            }

            // Copy xhr-sync-worker.js for jsdom (internally requires resolve)
            const xhrSrc = path.join(
              __dirname, "..", "..", "..", "core", "node_modules",
              "jsdom", "lib", "jsdom", "living", "xhr", "xhr-sync-worker.js",
            );
            const xhrDest = path.join(__dirname, "..", "out", "xhr-sync-worker.js");
            if (fs.existsSync(xhrSrc)) {
              fs.copyFileSync(xhrSrc, xhrDest);
              console.log("Copied xhr-sync-worker.js for jsdom");
            }

            console.log("VS Code Extension esbuild complete"); // used verbatim in vscode tasks to detect completion
          }
        });
      },
    },
  ],
};

void (async () => {
  // Create .buildTimestamp.js before starting the first build
  writeBuildTimestamp();
  // Bundles the extension into one file
  if (flags.includes("--watch")) {
    const ctx = await esbuild.context(esbuildConfig);
    await ctx.watch();
  } else if (flags.includes("--notify")) {
    const inFile = esbuildConfig.entryPoints[0];
    const outFile = esbuildConfig.outfile;

    // The watcher automatically notices changes to source files
    // so the only thing it needs to be notified about is if the
    // output file gets removed.
    if (fs.existsSync(outFile)) {
      console.log("VS Code Extension esbuild up to date");
      return;
    }

    fs.watchFile(outFile, (current, previous) => {
      if (current.size > 0) {
        console.log("VS Code Extension esbuild rebuild complete");
        fs.unwatchFile(outFile);
        process.exit(0);
      }
    });

    console.log("Triggering VS Code Extension esbuild rebuild...");
    writeBuildTimestamp();
  } else {
    await esbuild.build(esbuildConfig);
  }
})();