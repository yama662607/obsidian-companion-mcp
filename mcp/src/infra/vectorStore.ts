import { promises as fs } from "node:fs";
import path from "node:path";
import type { IndexedChunk, IndexedNoteState, SemanticSnapshot } from "../domain/semanticService";
import { logError, logInfo } from "./logger";

type PersistedSnapshot = {
  version: 2;
  chunks: Array<[string, IndexedChunk]>;
  noteStates: Array<[string, IndexedNoteState]>;
};

export class VectorStore {
  private indexPath: string;

  constructor(vaultPath: string, configDir: string) {
    this.indexPath = path.join(
      vaultPath,
      configDir,
      "plugins",
      "companion-mcp",
      "data",
      "semantic-index.json",
    );
  }

  /**
   * Updates the index path dynamically (called after plugin handshake).
   */
  public updateIndexPath(vaultPath: string, configDir: string): void {
    this.indexPath = path.join(
      vaultPath,
      configDir,
      "plugins",
      "companion-mcp",
      "data",
      "semantic-index.json",
    );
  }

  async load(): Promise<SemanticSnapshot | Map<string, IndexedChunk>> {
    try {
      // Check existence asynchronously
      try {
        await fs.access(this.indexPath);
      } catch {
        return new Map();
      }

      const raw = await fs.readFile(this.indexPath, "utf-8");
      const data = JSON.parse(raw) as PersistedSnapshot | Array<[string, IndexedChunk]>;
      if (Array.isArray(data)) {
        logInfo(`vector index loaded: ${data.length} chunk entries from ${this.indexPath}`);
        return new Map(data);
      }

      logInfo(
        `vector index loaded: ${data.chunks.length} chunk entries and ${data.noteStates.length} note states from ${this.indexPath}`,
      );
      return {
        chunks: new Map(data.chunks),
        noteStates: new Map(data.noteStates),
      };
    } catch (error) {
      logError(`failed to load vector index: ${String(error)}`);
      return new Map();
    }
  }

  async save(snapshot: SemanticSnapshot): Promise<void> {
    try {
      const dir = path.dirname(this.indexPath);
      // Create directory asynchronously
      await fs.mkdir(dir, { recursive: true });

      const data: PersistedSnapshot = {
        version: 2,
        chunks: Array.from(snapshot.chunks.entries()),
        noteStates: Array.from(snapshot.noteStates.entries()),
      };
      await fs.writeFile(this.indexPath, JSON.stringify(data), "utf-8");
      logInfo(
        `vector index saved: ${snapshot.chunks.size} chunk entries and ${snapshot.noteStates.size} note states to ${this.indexPath}`,
      );
    } catch (error) {
      logError(`failed to save vector index: ${String(error)}`);
    }
  }

  getIndexPath(): string {
    return this.indexPath;
  }
}
