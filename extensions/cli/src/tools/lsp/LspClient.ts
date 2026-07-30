/**
 * LSP Client for Friday CLI
 *
 * Provides Language Server Protocol communication using only Node.js built-in modules.
 * Handles JSON-RPC 2.0 over stdio with Content-Length header framing.
 *
 * Features:
 * - Auto-detect 10+ language project types
 * - Auto-locate LSP servers on PATH
 * - 30s idle auto-disconnect
 * - Cross-platform compatibility
 */

import { ChildProcess, execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface DocumentSymbol {
  name: string;
  kind: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  selectionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  children?: DocumentSymbol[];
}

export interface Location {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface CallHierarchyItem {
  name: string;
  kind: number;
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  selectionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  detail?: string;
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem;
  fromRanges: Array<{
    start: { line: number; character: number };
    end: { line: number; character: number };
  }>;
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem;
  fromRanges: Array<{
    start: { line: number; character: number };
    end: { line: number; character: number };
  }>;
}

// Symbol kinds from LSP spec
export const SymbolKind: Record<string, number> = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
};

export const SymbolKindNames: Record<number, string> = {};
for (const [name, value] of Object.entries(SymbolKind)) {
  SymbolKindNames[value] = name;
}

// ---------------------------------------------------------------------------
// Project type detection
// ---------------------------------------------------------------------------

interface LspServerConfig {
  language: string;
  extensions: string[];
  serverCommand: string[];
  markerFiles: string[];
  initOptions?: any;
}

const LSP_SERVER_CONFIGS: LspServerConfig[] = [
  {
    language: "typescript",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    serverCommand: ["typescript-language-server", "--stdio"],
    markerFiles: ["package.json"],
    initOptions: {},
  },
  {
    language: "python",
    extensions: [".py", ".pyi", ".pyx"],
    serverCommand: ["pyright-langserver", "--stdio"],
    markerFiles: ["pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "requirements.txt"],
    initOptions: {},
  },
  {
    language: "rust",
    extensions: [".rs"],
    serverCommand: ["rust-analyzer"],
    markerFiles: ["Cargo.toml"],
    initOptions: {},
  },
  {
    language: "go",
    extensions: [".go"],
    serverCommand: ["gopls"],
    markerFiles: ["go.mod", "go.sum"],
    initOptions: {},
  },
  {
    language: "java",
    extensions: [".java"],
    serverCommand: ["jdtls"],
    markerFiles: ["pom.xml", "build.gradle", "build.gradle.kts"],
    initOptions: {},
  },
  {
    language: "cpp",
    extensions: [".cpp", ".cc", ".cxx", ".c", ".h", ".hpp", ".hxx"],
    serverCommand: ["clangd"],
    markerFiles: ["CMakeLists.txt", "compile_commands.json", ".clangd"],
    initOptions: {},
  },
  {
    language: "csharp",
    extensions: [".cs"],
    serverCommand: ["omnisharp", "--languageserver"],
    markerFiles: ["*.csproj", "*.sln"],
    initOptions: {},
  },
  {
    language: "ruby",
    extensions: [".rb"],
    serverCommand: ["solargraph", "stdio"],
    markerFiles: ["Gemfile", ".ruby-version"],
    initOptions: {},
  },
  {
    language: "php",
    extensions: [".php"],
    serverCommand: ["intelephense", "--stdio"],
    markerFiles: ["composer.json"],
    initOptions: {},
  },
  {
    language: "lua",
    extensions: [".lua"],
    serverCommand: ["lua-language-server"],
    markerFiles: [".luarc.json", "stylua.toml"],
    initOptions: {},
  },
  {
    language: "docker",
    extensions: [".dockerfile", "Dockerfile"],
    serverCommand: ["docker-langserver", "--stdio"],
    markerFiles: ["Dockerfile"],
    initOptions: {},
  },
  {
    language: "yaml",
    extensions: [".yml", ".yaml"],
    serverCommand: ["yaml-language-server", "--stdio"],
    markerFiles: [],
    initOptions: {},
  },
];

// ---------------------------------------------------------------------------
// LspClient class
// ---------------------------------------------------------------------------

export class LspClient {
  private static instances = new Map<string, LspClient>();

  private workspaceDir: string;
  private config: LspServerConfig | null = null;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: any) => void; reject: (err: Error) => void }
  >();
  private initialized = false;
  private openDocuments = new Set<string>();
  private idleTimer: NodeJS.Timeout | null = null;
  private buffer = "";
  private shutdown = false;

  private constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * Get or create an LspClient instance for the given workspace.
   */
  static getInstance(workspaceDir: string): LspClient {
    const key = path.resolve(workspaceDir);
    let instance = LspClient.instances.get(key);
    if (!instance || instance.shutdown) {
      instance = new LspClient(key);
      LspClient.instances.set(key, instance);
    }
    return instance;
  }

  /**
   * Shutdown all instances (for cleanup).
   */
  static async shutdownAll(): Promise<void> {
    const shutdowns: Promise<void>[] = [];
    for (const instance of LspClient.instances.values()) {
      shutdowns.push(instance.shutdownServer().catch(() => {}));
    }
    LspClient.instances.clear();
    await Promise.all(shutdowns);
  }

  // -----------------------------------------------------------------------
  // Project detection
  // -----------------------------------------------------------------------

  /**
   * Detect the project type by scanning for marker files.
   */
  private detectProjectType(): LspServerConfig | null {
    // First check if files match by extension
    const extCounts = new Map<LspServerConfig, number>();
    this.scanDirectoryForExtensions(this.workspaceDir, extCounts, 500);

    // Check marker files
    for (const config of LSP_SERVER_CONFIGS) {
      for (const marker of config.markerFiles) {
        if (marker.includes("*")) {
          // Glob pattern - simple case: check directory
          try {
            const dir = path.dirname(path.join(this.workspaceDir, marker));
            const pattern = path.basename(marker);
            const files = fs.readdirSync(path.join(this.workspaceDir, dir));
            if (
              files.some((f) => {
                const regex = new RegExp(
                  "^" + pattern.replace(/\*/g, ".*").replace(/\./g, "\\.") + "$",
                );
                return regex.test(f);
              })
            ) {
              return config;
            }
          } catch {
            // ignore
          }
        } else {
          const markerPath = path.join(this.workspaceDir, marker);
          if (fs.existsSync(markerPath)) {
            return config;
          }
        }
      }
    }

    // Fall back to extension-based detection
    let bestConfig: LspServerConfig | null = null;
    let bestCount = 0;
    for (const [config, count] of extCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestConfig = config;
      }
    }

    return bestConfig;
  }

  private scanDirectoryForExtensions(
    dir: string,
    counts: Map<LspServerConfig, number>,
    maxFiles: number,
  ): void {
    let scanned = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (scanned >= maxFiles) return;
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this.scanDirectoryForExtensions(fullPath, counts, maxFiles - scanned);
        } else if (entry.isFile()) {
          scanned++;
          const ext = path.extname(entry.name).toLowerCase();
          for (const config of LSP_SERVER_CONFIGS) {
            if (config.extensions.includes(ext)) {
              counts.set(config, (counts.get(config) || 0) + 1);
            }
          }
        }
      }
    } catch {
      // ignore permission errors
    }
  }

  // -----------------------------------------------------------------------
  // Server lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialize the LSP server. Detects project type, finds server, and
   * completes the initialize handshake.
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.process && !this.process.killed) {
      this.resetIdleTimer();
      return;
    }

    this.config = this.detectProjectType();
    if (!this.config) {
      throw new Error(
        `No LSP server configuration detected for workspace: ${this.workspaceDir}. ` +
          `Supported project types: TypeScript/JavaScript, Python, Rust, Go, Java, C/C++, C#, Ruby, PHP, Lua, Docker, YAML.`,
      );
    }

    const resolvedCommand = this.resolveServerCommand(this.config.serverCommand);
    await this.startServer(resolvedCommand);
    this.initialized = true;
    this.resetIdleTimer();
  }

  /**
   * Resolve the server command - checks if the command exists on PATH.
   */
  private resolveServerCommand(command: string[]): string[] {
    const cmd = command[0];
    if (fs.existsSync(cmd) || cmd.includes(path.sep)) {
      return command;
    }
    // Try common npm global paths
    const npmBinPaths = this.getNpmBinPaths();
    for (const binPath of npmBinPaths) {
      const fullPath = path.join(
        binPath,
        process.platform === "win32" ? `${cmd}.cmd` : cmd,
      );
      if (fs.existsSync(fullPath)) {
        return [fullPath, ...command.slice(1)];
      }
    }

    // Try npx as fallback
    return ["npx", "--yes", ...command];
  }

  private getNpmBinPaths(): string[] {
    const paths: string[] = [];
    try {
      const npmBin = this.execSyncCmd("npm bin -g").trim();
      if (npmBin) paths.push(npmBin);
    } catch {
      // ignore
    }
    // Common locations
    if (process.platform === "win32") {
      const appData = process.env.APPDATA || "";
      paths.push(path.join(appData, "npm"));
      paths.push(path.join(process.env.USERPROFILE || "", "AppData", "Roaming", "npm"));
    } else {
      paths.push("/usr/local/bin");
      paths.push(path.join(process.env.HOME || "/root", ".npm-global", "bin"));
      paths.push(path.join(process.env.HOME || "/root", "node_modules", ".bin"));
    }
    return paths;
  }

  private execSyncCmd(cmd: string): string {
    try {
      return execSync(cmd, {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 5000,
      });
    } catch {
      return "";
    }
  }

  private async startServer(command: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(command[0], command.slice(1), {
          cwd: this.workspaceDir,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env },
        });

        this.process.on("error", (err) => {
          reject(
            new Error(
              `Failed to start LSP server "${command.join(" ")}": ${err.message}`,
            ),
          );
        });

        this.process.on("exit", (code, signal) => {
          this.initialized = false;
          if (!this.shutdown) {
            // Reject any pending requests
            for (const [, pending] of this.pendingRequests) {
              pending.reject(
                new Error(
                  `LSP server exited unexpectedly (code: ${code}, signal: ${signal})`,
                ),
              );
            }
            this.pendingRequests.clear();
          }
        });

        // Set up stdout reader for JSON-RPC messages (stream-based)
        this.setupStreamReader();

        // Give the server a moment then send initialize
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `LSP server "${command[0]}" started but timed out waiting for connection`,
            ),
          );
        }, 15000);

        this.sendInitializeRequest()
          .then(() => {
            clearTimeout(timeout);
            // Send initialized notification
            this.sendNotification("initialized", {});
            resolve();
          })
          .catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
      } catch (err) {
        reject(err);
      }
    });

    // Also listen for stderr for diagnostic messages
    if (this.process.stderr) {
      this.process.stderr.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg.includes("[Error]") || msg.includes("panic") || msg.includes("FATAL")) {
          console.error(`[LSP stderr] ${msg}`);
        }
      });
    }
  }

  /**
   * Stream-based reader for JSON-RPC messages over stdout.
   * Handles Content-Length framing protocol used by LSP.
   */
  private setupStreamReader(): void {
    if (!this.process || !this.process.stdout) return;

    let contentLength = -1;
    let headerStr = "";

    this.process.stdout.on("data", (chunk: Buffer) => {
      const data = chunk.toString("utf-8");
      this.buffer += data;

      // Parse headers and body
      while (this.buffer.length > 0) {
        if (contentLength < 0) {
          // Looking for headers
          const headerEnd = this.buffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) break;

          headerStr = this.buffer.substring(0, headerEnd);
          this.buffer = this.buffer.substring(headerEnd + 4);

          // Parse Content-Length
          const match = headerStr.match(/Content-Length:\s*(\d+)/i);
          if (!match) {
            console.error("[LSP] No Content-Length header found");
            break;
          }
          contentLength = parseInt(match[1], 10);
        }

        if (contentLength >= 0 && this.buffer.length >= contentLength) {
          const body = this.buffer.substring(0, contentLength);
          this.buffer = this.buffer.substring(contentLength);
          contentLength = -1;

          try {
            this.handleMessage(body);
          } catch (err) {
            console.error("[LSP] Failed to parse message:", err);
          }
        } else {
          break; // Not enough data for body yet
        }
      }
    });

    // Also listen for stderr for diagnostic messages
    if (this.process.stderr) {
      this.process.stderr.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg.includes("[Error]") || msg.includes("panic") || msg.includes("FATAL")) {
          console.error(`[LSP stderr] ${msg}`);
        }
      });
    }
  }

  private handleMessage(body: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(body);
    } catch {
      return; // Invalid JSON, ignore
    }

    // Handle responses
    if ("id" in msg && ("result" in msg || "error" in msg)) {
      const response = msg as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(
            new Error(`LSP error ${response.error.code}: ${response.error.message}`),
          );
        } else {
          pending.resolve(response.result);
        }
      }
    }

    // Handle requests from server (e.g., window/showMessage)
    if ("method" in msg && "id" in msg && !("result" in msg) && !("error" in msg)) {
      // Server request - we can ignore most of these
    }
  }

  private async sendInitializeRequest(): Promise<any> {
    const params: any = {
      processId: process.pid,
      rootUri: this.filePathToUri(this.workspaceDir),
      rootPath: this.workspaceDir,
      capabilities: {
        textDocument: {
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          callHierarchy: {
            dynamicRegistration: true,
          },
          references: {
            dynamicRegistration: true,
          },
        },
        workspace: {
          symbol: {
            dynamicRegistration: true,
            symbolKind: { valueSet: Object.values(SymbolKind) },
          },
        },
      },
      workspaceFolders: [
        {
          uri: this.filePathToUri(this.workspaceDir),
          name: path.basename(this.workspaceDir),
        },
      ],
    };

    if (this.config?.initOptions) {
      params.initializationOptions = this.config.initOptions;
    }

    return this.sendRequest("initialize", params);
  }

  // -----------------------------------------------------------------------
  // Document management
  // -----------------------------------------------------------------------

  private filePathToUri(filePath: string): string {
    const resolved = path.resolve(filePath);
    // file:/// URI format
    let uriPath = resolved.replace(/\\/g, "/");
    if (!uriPath.startsWith("/")) {
      uriPath = "/" + uriPath;
    }
    return "file://" + uriPath;
  }

  uriToFilePath(uri: string): string {
    return lspUriToFilePath(uri);
  }

  /**
   * Open a document in the LSP server.
   */
  async openDocument(filePath: string): Promise<void> {
    await this.ensureInitialized();
    this.resetIdleTimer();

    const uri = this.filePathToUri(filePath);
    if (this.openDocuments.has(uri)) return;

    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const languageId = this.getLanguageId(filePath);

    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });

    this.openDocuments.add(uri);
  }

  /**
   * Close a document in the LSP server.
   */
  async closeDocument(filePath: string): Promise<void> {
    const uri = this.filePathToUri(filePath);
    if (!this.openDocuments.has(uri)) return;

    this.sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });

    this.openDocuments.delete(uri);
  }

  private getLanguageId(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".mts": "typescript",
      ".cts": "typescript",
      ".py": "python",
      ".pyi": "python",
      ".rs": "rust",
      ".go": "go",
      ".java": "java",
      ".cpp": "cpp",
      ".cc": "cpp",
      ".cxx": "cpp",
      ".c": "c",
      ".h": "c",
      ".hpp": "cpp",
      ".hxx": "cpp",
      ".cs": "csharp",
      ".rb": "ruby",
      ".php": "php",
      ".lua": "lua",
      ".yml": "yaml",
      ".yaml": "yaml",
    };
    return map[ext] || this.config?.language || "plaintext";
  }

  // -----------------------------------------------------------------------
  // LSP API methods
  // -----------------------------------------------------------------------

  /**
   * Get document symbols (outline) for a file.
   */
  async getDocumentSymbols(filePath: string): Promise<DocumentSymbol[]> {
    await this.ensureInitialized();
    await this.openDocument(filePath);
    this.resetIdleTimer();

    const uri = this.filePathToUri(filePath);
    const result = await this.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri },
    });

    // Result could be DocumentSymbol[] or SymbolInformation[]
    if (Array.isArray(result)) {
      return result as DocumentSymbol[];
    }
    return [];
  }

  /**
   * Get the hover information at a position.
   */
  async getHover(
    filePath: string,
    line: number,
    character: number,
  ): Promise<string | null> {
    await this.ensureInitialized();
    await this.openDocument(filePath);
    this.resetIdleTimer();

    const uri = this.filePathToUri(filePath);
    const result = await this.sendRequest("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    });

    if (result && result.contents) {
      if (typeof result.contents === "string") {
        return result.contents;
      }
      if (Array.isArray(result.contents)) {
        return result.contents
          .map((c: any) => (typeof c === "string" ? c : c.value || ""))
          .join("\n");
      }
      if (result.contents.value) {
        return result.contents.value;
      }
    }
    return null;
  }

  /**
   * Find all references to a symbol at the given position.
   */
  async findReferences(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location[]> {
    await this.ensureInitialized();
    await this.openDocument(filePath);
    this.resetIdleTimer();

    const uri = this.filePathToUri(filePath);
    const result = await this.sendRequest("textDocument/references", {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: true },
    });

    return (result as Location[]) || [];
  }

  /**
   * Find a symbol by name and return its position.
   */
  async findSymbolPosition(
    filePath: string,
    symbolName: string,
  ): Promise<{ line: number; character: number } | null> {
    const symbols = await this.getDocumentSymbols(filePath);

    // Search recursively
    const searchSymbols = (syms: DocumentSymbol[]): DocumentSymbol | null => {
      for (const sym of syms) {
        if (sym.name === symbolName) return sym;
        if (sym.children) {
          const found = searchSymbols(sym.children);
          if (found) return found;
        }
      }
      return null;
    };

    const symbol = searchSymbols(symbols);
    if (symbol) {
      return symbol.selectionRange.start;
    }
    return null;
  }

  /**
   * Prepare call hierarchy for a symbol at the given position.
   */
  async prepareCallHierarchy(
    filePath: string,
    line: number,
    character: number,
  ): Promise<CallHierarchyItem[]> {
    await this.ensureInitialized();
    await this.openDocument(filePath);
    this.resetIdleTimer();

    const uri = this.filePathToUri(filePath);
    try {
      const result = await this.sendRequest("textDocument/prepareCallHierarchy", {
        textDocument: { uri },
        position: { line, character },
      });
      return (result as CallHierarchyItem[]) || [];
    } catch {
      // Many LSP servers don't support call hierarchy
      return [];
    }
  }

  /**
   * Get incoming calls (who calls this function).
   */
  async getIncomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]> {
    try {
      const result = await this.sendRequest("callHierarchy/incomingCalls", {
        item,
      });
      return (result as CallHierarchyIncomingCall[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Get outgoing calls (what this function calls).
   */
  async getOutgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]> {
    try {
      const result = await this.sendRequest("callHierarchy/outgoingCalls", {
        item,
      });
      return (result as CallHierarchyOutgoingCall[]) || [];
    } catch {
      return [];
    }
  }

  /**
   * Get the definition location of a symbol.
   */
  async getDefinition(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location | Location[] | null> {
    await this.ensureInitialized();
    await this.openDocument(filePath);
    this.resetIdleTimer();

    const uri = this.filePathToUri(filePath);
    const result = await this.sendRequest("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    });

    return (result as Location | Location[]) || null;
  }

  // -----------------------------------------------------------------------
  // JSON-RPC communication
  // -----------------------------------------------------------------------

  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.process || this.process.killed) {
      throw new Error("LSP server is not running");
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const body = JSON.stringify(request);
      const header = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n`;
      const message = header + body;

      try {
        this.process!.stdin!.write(message, "utf-8");
      } catch (err: any) {
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to send LSP request: ${err.message}`));
      }
    });
  }

  private sendNotification(method: string, params?: any): void {
    if (!this.process || this.process.killed) return;

    const notification: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const body = JSON.stringify(notification);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n`;
    const message = header + body;

    try {
      this.process!.stdin!.write(message, "utf-8");
    } catch {
      // ignore
    }
  }

  // -----------------------------------------------------------------------
  // Idle timer
  // -----------------------------------------------------------------------

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.shutdownServer().catch(() => {});
    }, 30000); // 30 seconds idle timeout
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async shutdownServer(): Promise<void> {
    if (this.shutdown) return;
    this.shutdown = true;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.process && !this.process.killed) {
      try {
        await this.sendRequest("shutdown");
        this.sendNotification("exit");
      } catch {
        // ignore errors during shutdown
      }

      // Force kill after 5 seconds
      setTimeout(() => {
        try {
          if (this.process && !this.process.killed) {
            this.process.kill("SIGKILL");
          }
        } catch {
          // ignore
        }
      }, 5000);
    }

    this.initialized = false;
    this.openDocuments.clear();
    this.pendingRequests.clear();
    LspClient.instances.delete(path.resolve(this.workspaceDir));
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get detectedLanguage(): string {
    return this.config?.language || "unknown";
  }
}

// ---------------------------------------------------------------------------
// Standalone utility
// ---------------------------------------------------------------------------

/**
 * Convert a file:// URI to a filesystem path.
 */
export function lspUriToFilePath(uri: string): string {
  let filePath = uri.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "");
  // Handle percent-encoded characters (e.g., %20 → space)
  filePath = decodeURIComponent(filePath);
  // Windows: remove leading slash before drive letter (e.g., /C:/... → C:/...)
  if (process.platform === "win32" && filePath.match(/^\/[a-zA-Z]:\//)) {
    filePath = filePath.slice(1);
  }
  return filePath.replace(/\//g, path.sep);
}
