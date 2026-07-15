// Stub — Friday AI local-only mode
import type { ArtifactType, EmbeddingsCacheResponse, IFridayServerClient } from "../interface.js";

export class FridayServerClient implements IFridayServerClient {
  url: URL | undefined = undefined;

  constructor(..._args: any[]) {}

  get connected(): boolean {
    return false;
  }

  getUserToken(): string | undefined {
    return undefined;
  }

  async getConfig(): Promise<{ configJson: string }> {
    return { configJson: "{}" };
  }

  async getFromIndexCache<T extends ArtifactType>(
    _keys: string[],
    _artifactId: T,
    _repoName: string | undefined,
  ): Promise<EmbeddingsCacheResponse<T>> {
    return { files: {} };
  }
}
