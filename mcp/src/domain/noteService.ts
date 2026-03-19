import * as fallback from "../infra/fallbackStorage";
import type { PluginClient } from "../infra/pluginClient";
import { DomainError } from "./errors";
import type { SemanticService } from "./semanticService";

export class NoteService {
  constructor(
    private readonly pluginClient: PluginClient,
    private readonly semanticService?: SemanticService,
  ) {}

  private getFallbackDegradedReason(error: unknown): string {
    if (!(error instanceof DomainError)) {
      return "plugin_unavailable";
    }

    switch (error.code) {
      case "NOT_FOUND":
        return "plugin_not_found_fallback_used";
      case "VALIDATION":
        return "plugin_validation_fallback_used";
      case "CONFLICT":
        return "plugin_conflict_fallback_used";
      case "INTERNAL":
        return "plugin_internal_fallback_used";
      default:
        return "plugin_unavailable";
    }
  }

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
    } catch (error) {
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
        degradedReason: this.getFallbackDegradedReason(error),
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
    } catch (error) {
      const record = fallback.writeNote(path, content);
      this.semanticService?.upsert(path, record.content, Date.now());
      return {
        path,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error),
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
        return {
          deleted: true,
          degraded: true,
          degradedReason: this.getFallbackDegradedReason(error),
        };
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
    const existing = fallback.readNote(path);
    if (!existing) {
      throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
    }

    const mergedMetadata = { ...existing.metadata, ...metadata };

    try {
      await this.pluginClient.send("metadata.update", { path, metadata: mergedMetadata });
      const record = fallback.updateMetadata(path, mergedMetadata);
      this.semanticService?.upsert(path, record.content, Date.now());
      return {
        path,
        metadata: record.metadata,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: false,
        degradedReason: null,
      };
    } catch (error) {
      const record = fallback.updateMetadata(path, mergedMetadata);
      this.semanticService?.upsert(path, record.content, Date.now());
      return {
        path,
        metadata: record.metadata,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error),
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
    } catch (error) {
      if (error instanceof DomainError && error.code === "CONFLICT") {
        throw error;
      }

      const moved = fallback.moveNote(from, to);
      if (!moved) {
        if (error instanceof DomainError) {
          throw error;
        }
        throw new DomainError("NOT_FOUND", `Note not found: ${from}`);
      }
      this.semanticService?.movePath(from, to);
      const degradedReason = this.getFallbackDegradedReason(error);
      return { from, to, degraded: true, degradedReason };
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

    // 3. Flush the queue to completion so the tool semantics match "refresh"
    let flushedCount = 0;
    while (this.semanticService.getIndexStatus().pendingCount > 0) {
      const flushed = await this.semanticService.flushIndex(25);
      flushedCount += flushed;
      if (flushed === 0) {
        break;
      }
    }
    const indexStatus = this.semanticService.getIndexStatus();

    return {
      totalFound: notes.length,
      queuedCount,
      flushedCount,
      pendingCount: indexStatus.pendingCount,
      indexedNoteCount: indexStatus.indexedNoteCount,
      indexedChunkCount: indexStatus.indexedChunkCount,
      modelReady: indexStatus.modelReady,
    };
  }
}
