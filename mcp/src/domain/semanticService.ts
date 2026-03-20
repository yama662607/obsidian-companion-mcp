import * as fallback from "../infra/fallbackStorage";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embeddingProvider";
import { IndexingQueue } from "./indexingQueue";
import { boundSemanticChunkText, buildSemanticChunks, readTitleFromPath } from "./noteDocument";

export type IndexedChunk = {
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

export type IndexedNoteState = {
  path: string;
  updatedAt: number;
  size: number;
  chunkIds: string[];
};

export type SemanticSnapshot = {
  chunks: Map<string, IndexedChunk>;
  noteStates: Map<string, IndexedNoteState>;
};

type IndexedChunkLike =
  | IndexedChunk
  | {
      path: string;
      snippet: string;
      updatedAt: number;
      embedding: number[];
    };

type LegacyChunkMap = Map<string, IndexedChunkLike>;

type ChunkSearchOptions = {
  topK: number;
  maxPerNote: number;
  minScore?: number;
  pathPrefix?: string;
  notePaths?: string[];
};

type RefreshStats = {
  scannedCount: number;
  skippedCount: number;
  queuedCount: number;
  flushedCount: number;
  removedCount: number;
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}

function isSnapshot(value: SemanticSnapshot | LegacyChunkMap): value is SemanticSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "chunks" in value &&
    "noteStates" in value &&
    value.chunks instanceof Map &&
    value.noteStates instanceof Map
  );
}

export class SemanticService {
  private chunks = new Map<string, IndexedChunk>();
  private chunkIdsByPath = new Map<string, string[]>();
  private noteStates = new Map<string, IndexedNoteState>();
  private provider: EmbeddingProvider;
  private queue = new IndexingQueue();
  private lastRefreshStats: RefreshStats = {
    scannedCount: 0,
    skippedCount: 0,
    queuedCount: 0,
    flushedCount: 0,
    removedCount: 0,
  };

  constructor(preferRemote = false, vaultPath = "", configDir = "") {
    this.provider = createEmbeddingProvider(preferRemote, vaultPath, configDir);
  }

  private setNoteState(path: string, updatedAt: number, size: number, chunkIds: string[]): void {
    this.chunkIdsByPath.set(path, chunkIds);
    this.noteStates.set(path, {
      path,
      updatedAt,
      size,
      chunkIds,
    });
  }

  private replaceNoteChunks(
    path: string,
    nextChunks: IndexedChunk[],
    updatedAt: number,
    size: number,
  ): void {
    const previousChunkIds = this.chunkIdsByPath.get(path) ?? [];
    for (const chunkId of previousChunkIds) {
      this.chunks.delete(chunkId);
    }

    const nextChunkIds = nextChunks.map((chunk) => chunk.id);
    for (const chunk of nextChunks) {
      this.chunks.set(chunk.id, chunk);
    }
    this.setNoteState(path, updatedAt, size, nextChunkIds);
  }

  private rebuildChunkIds(): void {
    this.chunkIdsByPath = new Map();
    for (const [id, chunk] of this.chunks.entries()) {
      const chunkIds = this.chunkIdsByPath.get(chunk.path) ?? [];
      chunkIds.push(id);
      this.chunkIdsByPath.set(chunk.path, chunkIds);
    }
  }

  private seedNoteStateFromChunks(path: string): void {
    if (this.noteStates.has(path)) {
      return;
    }

    const chunkIds = this.chunkIdsByPath.get(path) ?? [];
    const firstChunk = chunkIds.length > 0 ? this.chunks.get(chunkIds[0]) : undefined;
    if (!firstChunk) {
      return;
    }

    const stat = fallback.getNoteStat(path);
    const derivedSize =
      stat?.size ??
      Buffer.byteLength(
        chunkIds
          .map((chunkId) => this.chunks.get(chunkId)?.text ?? "")
          .filter((text) => text.length > 0)
          .join("\n"),
        "utf8",
      );
    this.setNoteState(path, firstChunk.updatedAt, derivedSize, chunkIds);
  }

  upsert(path: string, content: string, updatedAt: number, size: number): boolean {
    const existing = this.noteStates.get(path);
    if (existing && existing.updatedAt >= updatedAt && existing.size === size) {
      return false;
    }

    return this.queue.enqueue({ path, content, updatedAt, size });
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

      this.replaceNoteChunks(job.path, nextChunks, job.updatedAt, job.size);
    }, maxItems);
  }

  remove(path: string): void {
    const existingChunkIds =
      this.noteStates.get(path)?.chunkIds ?? this.chunkIdsByPath.get(path) ?? [];
    for (const chunkId of existingChunkIds) {
      this.chunks.delete(chunkId);
    }
    this.chunkIdsByPath.delete(path);
    this.noteStates.delete(path);
    this.queue.removePath(path);
  }

  removeMissingPaths(existingPaths: Set<string>): number {
    let removedCount = 0;
    for (const path of Array.from(this.noteStates.keys())) {
      if (existingPaths.has(path)) {
        continue;
      }
      this.remove(path);
      removedCount += 1;
    }
    return removedCount;
  }

  movePath(from: string, to: string): void {
    const existing = this.noteStates.get(from);
    const existingChunkIds = existing?.chunkIds ?? this.chunkIdsByPath.get(from) ?? [];
    if (existingChunkIds.length === 0) {
      if (existing) {
        this.noteStates.delete(from);
        this.setNoteState(to, existing.updatedAt, existing.size, []);
      }
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
    this.noteStates.delete(from);
    this.replaceNoteChunks(to, movedChunks, existing?.updatedAt ?? Date.now(), existing?.size ?? 0);
    this.queue.renamePath(from, to);
  }

  recordRefreshStats(stats: RefreshStats): void {
    this.lastRefreshStats = stats;
  }

  getNoteState(path: string): IndexedNoteState | undefined {
    const state = this.noteStates.get(path);
    if (!state) {
      return undefined;
    }
    return { ...state, chunkIds: [...state.chunkIds] };
  }

  getIndexedPaths(): string[] {
    return Array.from(this.noteStates.keys());
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
    scannedCount: number;
    skippedCount: number;
    queuedCount: number;
    flushedCount: number;
    removedCount: number;
  } {
    const pendingCount = this.queue.getPendingCount();
    const modelReady = this.provider.getRuntimeState().modelReady;
    return {
      pendingCount,
      indexedNoteCount: this.noteStates.size,
      indexedChunkCount: this.chunks.size,
      running: this.queue.isRunning(),
      ready: pendingCount === 0 && modelReady,
      isEmpty: this.chunks.size === 0,
      modelReady,
      pendingSample: this.queue.getPendingSample(sampleLimit),
      scannedCount: this.lastRefreshStats.scannedCount,
      skippedCount: this.lastRefreshStats.skippedCount,
      queuedCount: this.lastRefreshStats.queuedCount,
      flushedCount: this.lastRefreshStats.flushedCount,
      removedCount: this.lastRefreshStats.removedCount,
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

  getSnapshot(): SemanticSnapshot {
    return {
      chunks: new Map(this.chunks),
      noteStates: new Map(
        Array.from(this.noteStates.entries()).map(([path, state]) => [
          path,
          { ...state, chunkIds: [...state.chunkIds] },
        ]),
      ),
    };
  }

  setNotes(notes: LegacyChunkMap): void {
    this.setSnapshot(notes);
  }

  setSnapshot(snapshot: SemanticSnapshot | LegacyChunkMap): void {
    this.chunks = new Map();
    this.chunkIdsByPath = new Map();
    this.noteStates = new Map();

    if (isSnapshot(snapshot)) {
      this.chunks = new Map(snapshot.chunks);
      this.rebuildChunkIds();
      for (const [path, state] of snapshot.noteStates.entries()) {
        const chunkIds = state.chunkIds.filter((chunkId) => this.chunks.has(chunkId));
        this.setNoteState(path, state.updatedAt, state.size, chunkIds);
      }
      for (const path of this.chunkIdsByPath.keys()) {
        this.seedNoteStateFromChunks(path);
      }
      return;
    }

    for (const [id, value] of snapshot.entries()) {
      if ("startLine" in value && "endLine" in value && "text" in value) {
        this.chunks.set(id, value);
        const chunkIds = this.chunkIdsByPath.get(value.path) ?? [];
        chunkIds.push(id);
        this.chunkIdsByPath.set(value.path, chunkIds);
        continue;
      }

      const note = fallback.readNote(value.path);
      if (note) {
        this.upsert(value.path, note.content, note.updatedAt, note.size);
        continue;
      }

      const chunkId = `${value.path}:0-0`;
      this.chunks.set(chunkId, {
        id: chunkId,
        path: value.path,
        title: readTitleFromPath(value.path),
        text: boundSemanticChunkText(value.snippet),
        startLine: 0,
        endLine: 0,
        headingPath: null,
        updatedAt: value.updatedAt,
        embedding: value.embedding,
      });
      this.setNoteState(
        value.path,
        value.updatedAt,
        Buffer.byteLength(boundSemanticChunkText(value.snippet), "utf8"),
        [chunkId],
      );
    }

    for (const path of this.chunkIdsByPath.keys()) {
      this.seedNoteStateFromChunks(path);
    }
  }
}
