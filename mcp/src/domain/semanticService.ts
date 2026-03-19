import { createEmbeddingProvider, type EmbeddingProvider } from "./embeddingProvider";
import { IndexingQueue } from "./indexingQueue";
import { buildSemanticChunks, readTitleFromPath } from "./noteDocument";

type IndexedChunk = {
  id: string;
  path: string;
  title: string;
  text: string;
  startLine: number;
  endLine: number;
  headingPath: string[] | null;
  updatedAt: number;
  embedding: number[];
};

type ChunkSearchOptions = {
  topK: number;
  maxPerNote: number;
  minScore?: number;
  pathPrefix?: string;
  notePaths?: string[];
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}

export class SemanticService {
  private chunks = new Map<string, IndexedChunk>();
  private chunkIdsByPath = new Map<string, string[]>();
  private provider: EmbeddingProvider;
  private queue = new IndexingQueue();

  constructor(preferRemote = false, vaultPath = "", configDir = "") {
    this.provider = createEmbeddingProvider(preferRemote, vaultPath, configDir);
  }

  private replaceNoteChunks(path: string, nextChunks: IndexedChunk[]): void {
    const previousChunkIds = this.chunkIdsByPath.get(path) ?? [];
    for (const chunkId of previousChunkIds) {
      this.chunks.delete(chunkId);
    }

    this.chunkIdsByPath.set(
      path,
      nextChunks.map((chunk) => chunk.id),
    );
    for (const chunk of nextChunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  upsert(path: string, content: string, updatedAt: number): boolean {
    const existingChunkIds = this.chunkIdsByPath.get(path);
    const existingUpdatedAt =
      existingChunkIds && existingChunkIds.length > 0
        ? (this.chunks.get(existingChunkIds[0])?.updatedAt ?? 0)
        : 0;
    if (existingUpdatedAt >= updatedAt) {
      return false;
    }

    return this.queue.enqueue({ path, content, updatedAt });
  }

  flushIndex(maxItems = 25): Promise<number> {
    return this.queue.process(async (job) => {
      const chunks = buildSemanticChunks(job.path, job.content);
      const nextChunks: IndexedChunk[] = [];

      for (const chunk of chunks) {
        const embedding = await this.provider.embed(chunk.text, false);
        nextChunks.push({
          id: chunk.id,
          path: chunk.path,
          title: readTitleFromPath(chunk.path),
          text: chunk.text,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          headingPath: chunk.headingPath,
          updatedAt: job.updatedAt,
          embedding,
        });
      }

      this.replaceNoteChunks(job.path, nextChunks);
    }, maxItems);
  }

  remove(path: string): void {
    const existingChunkIds = this.chunkIdsByPath.get(path) ?? [];
    for (const chunkId of existingChunkIds) {
      this.chunks.delete(chunkId);
    }
    this.chunkIdsByPath.delete(path);
    this.queue.removePath(path);
  }

  movePath(from: string, to: string): void {
    const existingChunkIds = this.chunkIdsByPath.get(from) ?? [];
    if (existingChunkIds.length === 0) {
      this.queue.renamePath(from, to);
      return;
    }

    const movedChunks: IndexedChunk[] = [];
    for (const chunkId of existingChunkIds) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) {
        continue;
      }
      this.chunks.delete(chunkId);
      movedChunks.push({
        ...chunk,
        id: `${to}:${chunk.startLine}-${chunk.endLine}`,
        path: to,
        title: readTitleFromPath(to),
      });
    }

    this.chunkIdsByPath.delete(from);
    this.replaceNoteChunks(to, movedChunks);
    this.queue.renamePath(from, to);
  }

  getIndexStatus(sampleLimit = 20): {
    pendingCount: number;
    indexedNoteCount: number;
    indexedChunkCount: number;
    running: boolean;
    ready: boolean;
    isEmpty: boolean;
    modelReady: boolean;
    pendingSample: string[];
  } {
    const pendingCount = this.queue.getPendingCount();
    return {
      pendingCount,
      indexedNoteCount: this.chunkIdsByPath.size,
      indexedChunkCount: this.chunks.size,
      running: this.queue.isRunning(),
      ready: pendingCount === 0,
      isEmpty: this.chunks.size === 0,
      modelReady: this.provider.getRuntimeState().modelReady,
      pendingSample: this.queue.getPendingSample(sampleLimit),
    };
  }

  async prepareModel(): Promise<void> {
    await this.provider.prepare();
  }

  isModelReady(): Promise<boolean> {
    return this.provider.isReady();
  }

  async searchWithStatus(
    query: string,
    options: ChunkSearchOptions,
  ): Promise<{
    matches: Array<{
      id: string;
      path: string;
      title: string;
      score: number;
      text: string;
      startLine: number;
      endLine: number;
      headingPath: string[] | null;
      updatedAt: number;
    }>;
    indexStatus: ReturnType<SemanticService["getIndexStatus"]>;
  }> {
    if (this.queue.getPendingCount() > 0) {
      await this.flushIndex(Math.max(options.topK * 2, 10));
    }

    return {
      matches: await this.search(query, options),
      indexStatus: this.getIndexStatus(),
    };
  }

  async search(
    query: string,
    options: ChunkSearchOptions,
  ): Promise<
    Array<{
      id: string;
      path: string;
      title: string;
      score: number;
      text: string;
      startLine: number;
      endLine: number;
      headingPath: string[] | null;
      updatedAt: number;
    }>
  > {
    if (this.chunks.size === 0) {
      return [];
    }

    const queryVector = await this.provider.embed(query, true);
    const allowedPaths = options.notePaths ? new Set(options.notePaths) : null;
    const perNoteCount = new Map<string, number>();

    return Array.from(this.chunks.values())
      .filter((chunk) => {
        if (options.pathPrefix && !chunk.path.startsWith(options.pathPrefix)) {
          return false;
        }
        if (allowedPaths && !allowedPaths.has(chunk.path)) {
          return false;
        }
        return true;
      })
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.embedding),
      }))
      .filter((chunk) => (options.minScore === undefined ? true : chunk.score >= options.minScore))
      .sort((left, right) => right.score - left.score)
      .filter((chunk) => {
        const current = perNoteCount.get(chunk.path) ?? 0;
        if (current >= options.maxPerNote) {
          return false;
        }
        perNoteCount.set(chunk.path, current + 1);
        return true;
      })
      .slice(0, options.topK);
  }

  getProvider(): EmbeddingProvider {
    return this.provider;
  }

  getNotes(): Map<string, IndexedChunk> {
    return this.chunks;
  }

  setNotes(
    notes: Map<
      string,
      | IndexedChunk
      | {
          path: string;
          snippet: string;
          updatedAt: number;
          embedding: number[];
        }
    >,
  ): void {
    this.chunks = new Map();
    this.chunkIdsByPath = new Map();

    for (const [id, value] of notes.entries()) {
      if ("startLine" in value && "endLine" in value && "text" in value) {
        this.chunks.set(id, value);
        const chunkIds = this.chunkIdsByPath.get(value.path) ?? [];
        chunkIds.push(id);
        this.chunkIdsByPath.set(value.path, chunkIds);
        continue;
      }

      const chunkId = `${value.path}:0-0`;
      this.chunks.set(chunkId, {
        id: chunkId,
        path: value.path,
        title: readTitleFromPath(value.path),
        text: value.snippet,
        startLine: 0,
        endLine: 0,
        headingPath: null,
        updatedAt: value.updatedAt,
        embedding: value.embedding,
      });
      this.chunkIdsByPath.set(value.path, [chunkId]);
    }
  }
}
