import * as fallback from "../infra/fallbackStorage";
import type { PluginClient } from "../infra/pluginClient";
import { DomainError } from "./errors";
import type { SemanticService } from "./semanticService";

export class NoteService {
  constructor(
    private readonly pluginClient: PluginClient,
    private readonly semanticService?: SemanticService,
  ) {}

  async read(path: string): Promise<{
    content: string;
    metadata: Record<string, unknown>;
    updatedAt: number;
    size: number;
    degraded: boolean;
    degradedReason: string | null;
  }> {
    try {
      await this.pluginClient.send("notes.read", { path });
      const hit = fallback.readNote(path);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
      }
      return {
        content: hit.content,
        metadata: hit.metadata,
        updatedAt: hit.updatedAt,
        size: hit.size,
        degraded: false,
        degradedReason: null,
      };
    } catch {
      const hit = fallback.readNote(path);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
      }
      return {
        content: hit.content,
        metadata: hit.metadata,
        updatedAt: hit.updatedAt,
        size: hit.size,
        degraded: true,
        degradedReason: "plugin_unavailable",
      };
    }
  }

  async write(
    path: string,
    content: string,
  ): Promise<{
    path: string;
    updatedAt: number;
    size: number;
    degraded: boolean;
    degradedReason: string | null;
  }> {
    if (!path) {
      throw new DomainError("VALIDATION", "path is required");
    }

    try {
      await this.pluginClient.send("notes.write", { path, content });
      const record = fallback.writeNote(path, content);
      this.semanticService?.upsert(path, record.content, Date.now());
      return {
        path,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: false,
        degradedReason: null,
      };
    } catch {
      const record = fallback.writeNote(path, content);
      this.semanticService?.upsert(path, record.content, Date.now());
      return {
        path,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: true,
        degradedReason: "plugin_unavailable",
      };
    }
  }

  async delete(
    path: string,
  ): Promise<{ deleted: boolean; degraded: boolean; degradedReason: string | null }> {
    try {
      await this.pluginClient.send("notes.delete", { path });
      this.semanticService?.remove(path);
      return { deleted: true, degraded: false, degradedReason: null };
    } catch (error) {
      const deleted = fallback.deleteNote(path);
      if (deleted) {
        this.semanticService?.remove(path);
        return { deleted: true, degraded: true, degradedReason: "plugin_unavailable" };
      }

      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        throw error;
      }

      throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
    }
  }

  async updateMetadata(
    path: string,
    metadata: Record<string, unknown>,
  ): Promise<{
    path: string;
    metadata: Record<string, unknown>;
    updatedAt: number;
    size: number;
    degraded: boolean;
    degradedReason: string | null;
  }> {
    try {
      await this.pluginClient.send("metadata.update", { path, metadata });
      const record = fallback.updateMetadata(path, metadata);
      this.semanticService?.upsert(path, record.content, Date.now());
      return {
        path,
        metadata: record.metadata,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: false,
        degradedReason: null,
      };
    } catch {
      const record = fallback.updateMetadata(path, metadata);
      this.semanticService?.upsert(path, record.content, Date.now());
      return {
        path,
        metadata: record.metadata,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: true,
        degradedReason: "plugin_unavailable",
      };
    }
  }

  list(
    path: string,
    options: { cursor?: string; limit?: number; recursive?: boolean; includeDirs?: boolean },
  ): {
    path: string;
    entries: fallback.ListedEntry[];
    nextCursor: string | null;
    hasMore: boolean;
    truncated: boolean;
    degraded: boolean;
    degradedReason: string | null;
  } {
    const result = fallback.listEntries(path, options);
    return {
      path,
      ...result,
      degraded: false,
      degradedReason: null,
    };
  }

  async move(
    from: string,
    to: string,
  ): Promise<{
    from: string;
    to: string;
    degraded: boolean;
    degradedReason: string | null;
  }> {
    try {
      await this.pluginClient.send("notes.move", { from, to });
      this.semanticService?.movePath(from, to);
      return { from, to, degraded: false, degradedReason: null };
    } catch {
      const moved = fallback.moveNote(from, to);
      if (!moved) {
        throw new DomainError("NOT_FOUND", `Note not found: ${from}`);
      }
      this.semanticService?.movePath(from, to);
      return { from, to, degraded: true, degradedReason: "plugin_unavailable" };
    }
  }

  getIndexStatus(pendingSampleLimit: number): {
    pendingCount: number;
    indexedNoteCount: number;
    indexedChunkCount: number;
    running: boolean;
    ready: boolean;
    isEmpty: boolean;
    modelReady: boolean;
    pendingSample: string[];
  } {
    if (!this.semanticService) {
      return {
        pendingCount: 0,
        indexedNoteCount: 0,
        indexedChunkCount: 0,
        running: false,
        ready: false,
        isEmpty: true,
        modelReady: false,
        pendingSample: [],
      };
    }

    return this.semanticService.getIndexStatus(pendingSampleLimit);
  }

  async refreshIndex(): Promise<{
    totalFound: number;
    queuedCount: number;
    flushedCount: number;
    pendingCount: number;
    indexedNoteCount: number;
    indexedChunkCount: number;
    modelReady: boolean;
  }> {
    if (!this.semanticService) {
      return {
        totalFound: 0,
        queuedCount: 0,
        flushedCount: 0,
        pendingCount: 0,
        indexedNoteCount: 0,
        indexedChunkCount: 0,
        modelReady: false,
      };
    }

    // 1. Ensure model is ready (this might download models if missing)
    await this.semanticService.prepareModel();

    // 2. Queue all notes for indexing
    const notes = fallback.listNotes();
    let queuedCount = 0;

    for (const note of notes) {
      const wasUpdated = this.semanticService.upsert(note.path, note.content, note.updatedAt);
      if (wasUpdated) {
        queuedCount++;
      }
    }

    // 3. Process a small batch immediately to confirm it works
    const flushedCount = queuedCount > 0 ? await this.semanticService.flushIndex(5) : 0;
    const indexStatus = this.semanticService.getIndexStatus();

    return {
      totalFound: notes.length,
      queuedCount,
      flushedCount,
      pendingCount: indexStatus.pendingCount,
      indexedNoteCount: indexStatus.indexedNoteCount,
      indexedChunkCount: indexStatus.indexedChunkCount,
      modelReady: true,
    };
  }
}
