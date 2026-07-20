import { RunResult } from "sqlite3";
import { v4 as uuidv4 } from "uuid";

import { isSupportedLanceDbCpuTargetForLinux } from "../config/util";
import {
  BranchAndDir,
  Chunk,
  ILLM,
  IndexTag,
  IndexingProgressUpdate,
} from "../index";
import { getLanceDbPath, migrate } from "../util/paths";
import { getUriPathBasename } from "../util/uri";
import {
  ensureLanceDbNative,
  getDownloadedVectordbEntry,
} from "../util/nativeAddon";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pathToFileURL } from "url";
import { basicChunker } from "./chunk/basic.js";
import { chunkDocument, shouldChunk } from "./chunk/chunk.js";
import { DatabaseConnection, SqliteDb } from "./refreshIndex.js";
import {
  CodebaseIndex,
  IndexResultType,
  MarkCompleteCallback,
  PathAndCacheKey,
  RefreshIndexResults,
} from "./types";

import type * as LanceType from "vectordb";
import { tagToString } from "./utils";

/**
 * 缓存原生模块探测结果，避免每次 create() 都做一次 connect 探针。
 * undefined = 尚未探测；true = 可用；false = 原生模块不可用。
 */
let lanceNativeVerified: boolean | undefined = undefined;

/**
 * 轻量验证 vectordb 的原生模块（index.node）能否真正加载。
 *
 * 仅 `import("vectordb")` 成功并不足以证明原生模块可用：在打包插件里
 * vectordb 可能被 inline 进 bundle，import 永远成功，但底层 index.node
 * 缺失时会在首次 connect 时才抛错，且错误常被上层 try/catch 吞掉，
 * 表现为「构建索引看似完成、codebase 查询却 No results」。
 *
 * 这里真正 connect 到一个临时目录并做一次最小操作，强制原生模块加载，
 * 从而把「import 成功但原生缺失」的情况暴露出来，使其 fall through 到下载。
 */
async function verifyLanceDbNativeLoads(
  lance: typeof LanceType,
): Promise<boolean> {
  if (lanceNativeVerified !== undefined) {
    return lanceNativeVerified;
  }
  const probeDir = path.join(
    os.tmpdir(),
    `friday-lancedb-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  try {
    const conn = await (lance as any).connect(probeDir);
    // 触发一次最小原生调用，强制加载 index.node
    await conn.tableNames();
    lanceNativeVerified = true;
    return true;
  } catch (e: any) {
    console.error(
      "[LanceDbIndex] vectordb imported but native module failed to load:",
      e?.message || e,
    );
    lanceNativeVerified = false;
    return false;
  } finally {
    try {
      fs.rmSync(probeDir, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
  }
}

interface LanceDbRow {
  uuid: string;
  path: string;
  cachekey: string;
  vector: number[];
  [key: string]: any;
}

type ItemWithChunks = { item: PathAndCacheKey; chunks: Chunk[] };

type ChunkMap = Map<string, ItemWithChunks>;

export class LanceDbIndex implements CodebaseIndex {
  private static lance: typeof LanceType | null = null;

  relativeExpectedTime: number = 13;
  get artifactId(): string {
    return `vectordb::${this.embeddingsProvider?.embeddingId}`;
  }

  /**
   * Factory method for creating LanceDbIndex instances.
   *
   * We dynamically import LanceDB only when needed. If the native addon is
   * not available, we trigger a background download to the user's local dir
   * and degrade gracefully — the next call will pick it up automatically.
   *
   * See isSupportedLanceDbCpuTargetForLinux() for platform compatibility details.
   */
  static async create(
    embeddingsProvider: ILLM,
    readFile: (filepath: string) => Promise<string>,
  ): Promise<LanceDbIndex | null> {
    console.log("[LanceDbIndex] create() called");
    if (!isSupportedLanceDbCpuTargetForLinux()) {
      return null;
    }

    // Priority 1: 已下载到 ~/.friday/native/node_modules/vectordb 的完整包。
    // 这是普通用户 / 打包插件的主路径——无需开发环境，原生模块由
    // vectordb 包装器在该目录树下自行解析（见 nativeAddon.ts）。
    const downloadedEntry = getDownloadedVectordbEntry();
    if (downloadedEntry) {
      try {
        const lance = await import(pathToFileURL(downloadedEntry).href);
        if (await verifyLanceDbNativeLoads(lance)) {
          this.lance = lance;
          return new LanceDbIndex(embeddingsProvider, readFile);
        }
      } catch (e: any) {
        console.error(
          "[LanceDbIndex] Failed to load downloaded vectordb:",
          e?.message || e,
        );
      }
    }

    // Priority 2: 开发环境内联 vectordb（node_modules 里有原生模块时直接用，省去下载）。
    try {
      const lance = await import("vectordb");
      if (await verifyLanceDbNativeLoads(lance)) {
        this.lance = lance;
        return new LanceDbIndex(embeddingsProvider, readFile);
      }
    } catch {
      // import 本身失败，继续走下载分支
    }

    // Priority 3: 无任何可用原生模块 → 后台下载完整 vectordb 包到 ~/.friday/native/node_modules/
    console.log(
      "[LanceDbIndex] vectordb not available, triggering background download to ~/.friday/native ...",
    );
    ensureLanceDbNative();
    return null;
  }

  private constructor(
    private readonly embeddingsProvider: ILLM,
    private readonly readFile: (filepath: string) => Promise<string>,
  ) {
    if (!LanceDbIndex.lance) {
      throw new Error("LanceDB not initialized");
    }
  }

  tableNameForTag(tag: IndexTag) {
    return tagToString(tag).replace(/[^\w-_.]/g, "");
  }

  private async createSqliteCacheTable(db: DatabaseConnection) {
    await db.exec(`CREATE TABLE IF NOT EXISTS lance_db_cache (
        uuid TEXT PRIMARY KEY,
        cacheKey TEXT NOT NULL,
        path TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        vector TEXT NOT NULL,
        startLine INTEGER NOT NULL,
        endLine INTEGER NOT NULL,
        contents TEXT NOT NULL
    )`);

    await new Promise((resolve) => {
      void migrate(
        "lancedb_sqlite_artifact_id_column",
        async () => {
          try {
            const pragma = await db.all("PRAGMA table_info(lance_db_cache)");

            const hasArtifactIdCol = pragma.some(
              (pragma) => pragma.name === "artifact_id",
            );

            if (!hasArtifactIdCol) {
              await db.exec(
                "ALTER TABLE lance_db_cache ADD COLUMN artifact_id TEXT NOT NULL DEFAULT 'UNDEFINED'",
              );
            }
          } finally {
            resolve(undefined);
          }
        },
        () => resolve(undefined),
      );
    });
  }

  private async computeRows(items: PathAndCacheKey[]): Promise<LanceDbRow[]> {
    const chunkMap = await this.collectChunks(items);
    const allChunks = Array.from(chunkMap.values()).flatMap(
      ({ chunks }) => chunks,
    );
    const embeddings = await this.getEmbeddings(allChunks);

    for (let i = embeddings.length - 1; i >= 0; i--) {
      if (embeddings[i] === undefined) {
        const chunk = allChunks[i];
        const chunks = chunkMap.get(chunk.filepath)?.chunks;
        if (chunks) {
          const index = chunks.findIndex((c) => c === chunk);
          if (index !== -1) {
            chunks.splice(index, 1);
          }
        }

        embeddings.splice(i, 1);
      }
    }

    return this.createLanceDbRows(chunkMap, embeddings);
  }

  private async collectChunks(items: PathAndCacheKey[]): Promise<ChunkMap> {
    const chunkMap: ChunkMap = new Map();

    for (const item of items) {
      try {
        const content = await this.readFile(item.path);

        if (!shouldChunk(item.path, content)) {
          continue;
        }

        const chunks = await this.getChunks(item, content);
        chunkMap.set(item.path, { item, chunks });
      } catch (err) {
        console.log(`LanceDBIndex, skipping ${item.path}: ${err}`);
      }
    }

    return chunkMap;
  }

  private async getChunks(
    item: PathAndCacheKey,
    content: string,
  ): Promise<Chunk[]> {
    if (!this.embeddingsProvider) {
      return [];
    }
    const chunks: Chunk[] = [];

    const chunkParams = {
      filepath: item.path,
      contents: content,
      maxChunkSize: this.embeddingsProvider.maxEmbeddingChunkSize,
      digest: item.cacheKey,
    };

    for await (const chunk of chunkDocument(chunkParams)) {
      if (chunk.content.length === 0) {
        throw new Error("did not chunk properly");
      }

      chunks.push(chunk);
    }

    return chunks;
  }

  private async getEmbeddings(chunks: Chunk[]): Promise<number[][]> {
    if (!this.embeddingsProvider) {
      return [];
    }
    try {
      return await this.embeddingsProvider.embed(chunks.map((c) => c.content));
    } catch (err) {
      throw new Error(
        `Failed to generate embeddings for ${chunks.length} chunks with provider: ${this.embeddingsProvider.embeddingId}: ${err}`,
        { cause: err },
      );
    }
  }

  private createLanceDbRows(
    chunkMap: ChunkMap,
    embeddings: number[][],
  ): LanceDbRow[] {
    const results: LanceDbRow[] = [];
    let embeddingIndex = 0;

    for (const [path, { item, chunks }] of chunkMap) {
      for (const chunk of chunks) {
        results.push({
          path,
          cachekey: item.cacheKey,
          uuid: uuidv4(),
          vector: embeddings[embeddingIndex],
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          contents: chunk.content,
        });
        embeddingIndex++;
      }
    }

    return results;
  }

  /**
   * Due to a bug in indexing, some indexes have vectors
   * without the surrounding []. These would fail to parse
   * but this allows such existing indexes to function properly
   */
  private parseVector(vector: string): number[] {
    try {
      return JSON.parse(vector);
    } catch (err) {
      try {
        return JSON.parse(`[${vector}]`);
      } catch (err2) {
        throw new Error(`Failed to parse vector: ${vector}`, { cause: err2 });
      }
    }
  }

  async *update(
    tag: IndexTag,
    results: RefreshIndexResults,
    markComplete: MarkCompleteCallback,
    repoName: string | undefined,
  ): AsyncGenerator<IndexingProgressUpdate> {
    const lance = LanceDbIndex.lance!;
    const sqliteDb = await SqliteDb.get();
    await this.createSqliteCacheTable(sqliteDb);

    const lanceTableName = this.tableNameForTag(tag);
    const lanceDb = await lance.connect(getLanceDbPath());
    const existingLanceTables = await lanceDb.tableNames();

    let lanceTable: LanceType.Table<number[]> | undefined = undefined;
    let needToCreateLanceTable = !existingLanceTables.includes(lanceTableName);

    const addComputedLanceDbRows = async (
      pathAndCacheKeys: PathAndCacheKey[],
      computedRows: LanceDbRow[],
    ) => {
      if (lanceTable) {
        if (computedRows.length > 0) {
          await lanceTable.add(computedRows);
        }
      } else if (existingLanceTables.includes(lanceTableName)) {
        lanceTable = await lanceDb.openTable(lanceTableName);
        needToCreateLanceTable = false;
        if (computedRows.length > 0) {
          await lanceTable.add(computedRows);
        }
      } else if (computedRows.length > 0) {
        lanceTable = await lanceDb.createTable(lanceTableName, computedRows);
        needToCreateLanceTable = false;
      }

      await markComplete(pathAndCacheKeys, IndexResultType.Compute);
    };

    yield {
      progress: 0,
      desc: `Computing embeddings for ${
        results.compute.length
      } ${this.formatListPlurality("file", results.compute.length)}`,
      status: "indexing",
    };

    const dbRows = await this.computeRows(results.compute);
    await this.insertRows(sqliteDb, dbRows);
    await addComputedLanceDbRows(results.compute, dbRows);
    let accumulatedProgress = 0;

    for (const { path, cacheKey } of results.addTag) {
      const stmt = await sqliteDb.prepare(
        "SELECT * FROM lance_db_cache WHERE cacheKey = ? AND artifact_id = ?",
        cacheKey,
        this.artifactId,
      );
      const cachedItems = await stmt.all();

      const lanceRows: LanceDbRow[] = [];
      for (const item of cachedItems) {
        try {
          const vector = this.parseVector(item.vector);
          const { uuid, startLine, endLine, contents } = item;

          lanceRows.push({
            path,
            uuid,
            startLine,
            endLine,
            contents,
            cachekey: cacheKey,
            vector,
          });
        } catch (err) {
          console.warn(
            `LanceDBIndex, skipping ${item.path} due to invalid vector JSON:\n${item.vector}\n\nError: ${err}`,
          );
        }
      }

      if (lanceRows.length > 0) {
        if (needToCreateLanceTable) {
          lanceTable = await lanceDb.createTable(lanceTableName, lanceRows);
          needToCreateLanceTable = false;
        } else if (!lanceTable) {
          lanceTable = await lanceDb.openTable(lanceTableName);
          needToCreateLanceTable = false;
          await lanceTable.add(lanceRows);
        } else {
          await lanceTable?.add(lanceRows);
        }
      }

      await markComplete([{ path, cacheKey }], IndexResultType.AddTag);
      accumulatedProgress += 1 / results.addTag.length / 3;
      yield {
        progress: accumulatedProgress,
        desc: `Indexing ${getUriPathBasename(path)}`,
        status: "indexing",
      };
    }

    if (!needToCreateLanceTable) {
      const toDel = [...results.removeTag, ...results.del];

      if (!lanceTable) {
        lanceTable = await lanceDb.openTable(lanceTableName);
      }

      for (const { path, cacheKey } of toDel) {
        await lanceTable.delete(
          `cachekey = '${cacheKey}' AND path = '${path}'`,
        );

        accumulatedProgress += 1 / toDel.length / 3;
        yield {
          progress: accumulatedProgress,
          desc: `Stashing ${getUriPathBasename(path)}`,
          status: "indexing",
        };
      }
    }

    await markComplete(results.removeTag, IndexResultType.RemoveTag);

    for (const { path, cacheKey } of results.del) {
      await sqliteDb.run(
        "DELETE FROM lance_db_cache WHERE cacheKey = ? AND path = ? AND artifact_id = ?",
        cacheKey,
        path,
        this.artifactId,
      );
      accumulatedProgress += 1 / results.del.length / 3;
      yield {
        progress: accumulatedProgress,
        desc: `Removing ${getUriPathBasename(path)}`,
        status: "indexing",
      };
    }

    await markComplete(results.del, IndexResultType.Delete);

    yield {
      progress: 1,
      desc: "Completed Calculating Embeddings",
      status: "done",
    };
  }

  private async _retrieveForTag(
    tag: IndexTag,
    n: number,
    directory: string | undefined,
    vector: number[],
    db: any,
  ): Promise<LanceDbRow[]> {
    const tableName = this.tableNameForTag(tag);
    const tableNames = await db.tableNames();
    if (!tableNames.includes(tableName)) {
      console.warn("Table not found in LanceDB", tableName);
      return [];
    }

    const table = await db.openTable(tableName);
    let query = table.search(vector);
    if (directory) {
      query = query.where(`path LIKE '${directory}%'`).limit(300);
    } else {
      query = query.limit(n);
    }
    const results = await query.execute();
    return results.slice(0, n) as any;
  }

  async retrieve(
    query: string,
    n: number,
    tags: BranchAndDir[],
    filterDirectory: string | undefined,
  ): Promise<Chunk[]> {
    const lance = LanceDbIndex.lance!;
    if (!this.embeddingsProvider) {
      return [];
    }

    // Use just the first chunk of the user query in case it is too long
    const chunks = [];
    for await (const chunk of basicChunker(
      query,
      this.embeddingsProvider.maxEmbeddingChunkSize,
    )) {
      chunks.push(chunk);
    }
    let vector = null;
    try {
      [vector] = await this.embeddingsProvider.embed(
        chunks.map((c) => c.content),
      );
    } catch (err) {
      // If we fail to chunk, we just use what was happening before.
      [vector] = await this.embeddingsProvider.embed([query]);
    }

    const db = await lance.connect(getLanceDbPath());

    let allResults = [];
    for (const tag of tags) {
      const results = await this._retrieveForTag(
        { ...tag, artifactId: this.artifactId },
        n,
        filterDirectory,
        vector,
        db,
      );
      allResults.push(...results);
    }

    allResults = allResults
      .sort((a, b) => a._distance - b._distance)
      .slice(0, n);

    const sqliteDb = await SqliteDb.get();
    const data = await sqliteDb.all(
      `SELECT * FROM lance_db_cache WHERE uuid in (${allResults
        .map((r) => `'${r.uuid}'`)
        .join(",")})`,
    );

    return data.map((d) => {
      return {
        digest: d.cacheKey,
        filepath: d.path,
        startLine: d.startLine,
        endLine: d.endLine,
        index: 0,
        content: d.contents,
      };
    });
  }

  private async insertRows(
    db: DatabaseConnection,
    rows: LanceDbRow[],
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      db.db.serialize(() => {
        db.db.exec("BEGIN", (err: Error | null) => {
          if (err) {
            reject(new Error("error creating transaction", { cause: err }));
          }
        });

        const sql =
          "INSERT INTO lance_db_cache (uuid, cacheKey, path, artifact_id, vector, startLine, endLine, contents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        rows.map((r) => {
          db.db.run(
            sql,
            [
              r.uuid,
              r.cachekey,
              r.path,
              this.artifactId,
              JSON.stringify(r.vector),
              r.startLine,
              r.endLine,
              r.contents,
            ],
            (result: RunResult, err: Error) => {
              if (err) {
                reject(
                  new Error("error inserting into lance_db_cache table", {
                    cause: err,
                  }),
                );
              }
            },
          );
        });
        db.db.exec("COMMIT", (err: Error | null) => {
          if (err) {
            reject(
              new Error(
                "error while committing insert into lance_db_rows transaction",
                { cause: err },
              ),
            );
          } else {
            resolve();
          }
        });
      });
    });
  }

  private formatListPlurality(word: string, length: number): string {
    return length <= 1 ? word : `${word}s`;
  }
}
