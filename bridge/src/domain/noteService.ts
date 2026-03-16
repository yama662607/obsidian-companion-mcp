import { DomainError } from "./errors";
import * as fallback from "../infra/fallbackStorage";
import type { PluginClient } from "../infra/pluginClient";
import type { SemanticService } from "./semanticService";

export class NoteService {
    constructor(
        private readonly pluginClient: PluginClient,
        private readonly semanticService?: SemanticService,
    ) { }

    async read(path: string): Promise<{
        content: string;
        metadata: Record<string, unknown>;
        degraded: boolean;
        degradedReason: string | null;
    }> {
        try {
            await this.pluginClient.send("notes.read", { path });
            const hit = fallback.readNote(path);
            if (!hit) {
                throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
            }
            return { content: hit.content, metadata: hit.metadata, degraded: false, degradedReason: null };
        } catch {
            const hit = fallback.readNote(path);
            if (!hit) {
                throw new DomainError("NOT_FOUND", `Note not found: ${path}`);
            }
            return {
                content: hit.content,
                metadata: hit.metadata,
                degraded: true,
                degradedReason: "plugin_unavailable",
            };
        }
    }

    async write(path: string, content: string): Promise<{ path: string; degraded: boolean; degradedReason: string | null }> {
        if (!path) {
            throw new DomainError("VALIDATION", "path is required");
        }

        try {
            await this.pluginClient.send("notes.write", { path, content });
            const record = fallback.writeNote(path, content);
            this.semanticService?.upsert(path, record.content, Date.now());
            return { path, degraded: false, degradedReason: null };
        } catch {
            const record = fallback.writeNote(path, content);
            this.semanticService?.upsert(path, record.content, Date.now());
            return { path, degraded: true, degradedReason: "plugin_unavailable" };
        }
    }

    async delete(path: string): Promise<{ deleted: boolean; degraded: boolean; degradedReason: string | null }> {
        try {
            await this.pluginClient.send("notes.delete", { path });
            const deleted = fallback.deleteNote(path);
            if (deleted) {
                this.semanticService?.remove(path);
            }
            return { deleted, degraded: false, degradedReason: null };
        } catch {
            const deleted = fallback.deleteNote(path);
            if (deleted) {
                this.semanticService?.remove(path);
            }
            return { deleted, degraded: true, degradedReason: "plugin_unavailable" };
        }
    }

    async updateMetadata(path: string, metadata: Record<string, unknown>): Promise<{
        path: string;
        metadata: Record<string, unknown>;
        degraded: boolean;
        degradedReason: string | null;
    }> {
        if (metadata.invalid === true) {
            throw new DomainError("VALIDATION", "metadata contains disallowed values");
        }

        try {
            await this.pluginClient.send("metadata.update", { path, metadata });
            const record = fallback.updateMetadata(path, metadata);
            this.semanticService?.upsert(path, record.content, Date.now());
            return { path, metadata: record.metadata, degraded: false, degradedReason: null };
        } catch {
            const record = fallback.updateMetadata(path, metadata);
            this.semanticService?.upsert(path, record.content, Date.now());
            return {
                path,
                metadata: record.metadata,
                degraded: true,
                degradedReason: "plugin_unavailable",
            };
        }
    }
}
