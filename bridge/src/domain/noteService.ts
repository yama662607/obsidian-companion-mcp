import { DomainError } from "./errors";
import * as fallback from "../infra/fallbackStorage";
import type { PluginClient } from "../infra/pluginClient";

export class NoteService {
  constructor(private readonly pluginClient: PluginClient) {}

  async read(path: string): Promise<{ content: string; degraded: boolean }> {
    try {
      await this.pluginClient.send("notes.read", { path });
      const hit = fallback.readNote(path);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
      }
      return { content: hit.content, degraded: false };
    } catch {
      const hit = fallback.readNote(path);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
      }
      return { content: hit.content, degraded: true };
    }
  }

  async write(path: string, content: string): Promise<{ path: string; degraded: boolean }> {
    if (!path) {
      throw new DomainError("VALIDATION", "path is required");
    }

    try {
      await this.pluginClient.send("notes.write", { path, content });
      fallback.writeNote(path, content);
      return { path, degraded: false };
    } catch {
      fallback.writeNote(path, content);
      return { path, degraded: true };
    }
  }

  async delete(path: string): Promise<{ deleted: boolean; degraded: boolean }> {
    try {
      await this.pluginClient.send("notes.delete", { path });
      return { deleted: fallback.deleteNote(path), degraded: false };
    } catch {
      return { deleted: fallback.deleteNote(path), degraded: true };
    }
  }

  async updateMetadata(path: string, metadata: Record<string, unknown>): Promise<{ path: string; degraded: boolean }> {
    if (metadata.invalid === true) {
      throw new DomainError("VALIDATION", "metadata contains disallowed values");
    }

    try {
      await this.pluginClient.send("metadata.update", { path, metadata });
      fallback.updateMetadata(path, metadata);
      return { path, degraded: false };
    } catch {
      fallback.updateMetadata(path, metadata);
      return { path, degraded: true };
    }
  }
}
