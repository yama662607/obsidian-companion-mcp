import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TOOL_NAMES } from "../constants/toolNames";
import { DomainError } from "../domain/errors";
import type { NoteService } from "../domain/noteService";
import { errorResult, okResult } from "../domain/toolResult";
import {
  createNoteInputSchema,
  createNoteOutputSchema,
  deleteNoteInputSchema,
  deleteNoteOutputSchema,
  listNotesInputSchema,
  listNotesOutputSchema,
  moveNoteInputSchema,
  moveNoteOutputSchema,
  patchNoteMetadataInputSchema,
  patchNoteMetadataOutputSchema,
  refreshSemanticIndexInputSchema,
  refreshSemanticIndexOutputSchema,
  semanticIndexStatusInputSchema,
  semanticIndexStatusOutputSchema,
} from "../schemas/toolContracts";

function toIsoDate(value: number): string {
  return new Date(value).toISOString();
}

export function registerNoteTools(server: McpServer, noteService: NoteService): void {
  server.registerTool(
    TOOL_NAMES.REFRESH_SEMANTIC_INDEX,
    {
      description:
        "Build or rebuild the semantic index. This operation can take time on large vaults.",
      inputSchema: refreshSemanticIndexInputSchema,
      outputSchema: refreshSemanticIndexOutputSchema,
    },
    async () => {
      try {
        const result = await noteService.refreshIndex();
        return okResult(
          `Semantic indexing refresh completed (${result.pendingCount === 0 ? "ready" : "pending"})`,
          result,
          [
            `totalFound=${result.totalFound}`,
            `scanned=${result.scannedCount}`,
            `skipped=${result.skippedCount}`,
            `queued=${result.queuedCount}`,
            `flushed=${result.flushedCount}`,
            `removed=${result.removedCount}`,
            `pending=${result.pendingCount}`,
            `indexedNotes=${result.indexedNoteCount}`,
            `indexedChunks=${result.indexedChunkCount}`,
            `modelReady=${result.modelReady}`,
          ].join("\n"),
        );
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "refresh index failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.CREATE_NOTE,
    {
      description: "Create a markdown note at a vault-relative path.",
      inputSchema: createNoteInputSchema,
      outputSchema: createNoteOutputSchema,
    },
    async (params) => {
      try {
        const result = await noteService.write(params.path, params.content);
        return okResult(`Created note (${result.degraded ? "degraded" : "normal"})`, {
          note: { path: result.path },
          created: true,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
        });
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "create note failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.LIST_NOTES,
    {
      description:
        "List notes and directories under a vault-relative folder with bounded pagination.",
      inputSchema: listNotesInputSchema,
      outputSchema: listNotesOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    (params) => {
      try {
        const result = noteService.list(params.path, {
          cursor: params.cursor,
          limit: params.limit,
          recursive: params.recursive,
          includeDirs: params.includeDirs,
        });
        return okResult(`Listed ${result.entries.length} entries`, {
          path: result.path,
          returned: result.entries.length,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          entries: result.entries.map((entry) => ({
            ...entry,
            updatedAt: toIsoDate(entry.updatedAt),
          })),
          degraded: result.degraded,
          degradedReason: result.degradedReason,
        });
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "list notes failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.MOVE_NOTE,
    {
      description: "Move or rename a note within the vault root.",
      inputSchema: moveNoteInputSchema,
      outputSchema: moveNoteOutputSchema,
    },
    async (params) => {
      try {
        const result = await noteService.move(params.from, params.to);
        return okResult(`Moved note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "move note failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.PATCH_NOTE_METADATA,
    {
      description: "Patch note frontmatter without editing markdown body content.",
      inputSchema: patchNoteMetadataInputSchema,
      outputSchema: patchNoteMetadataOutputSchema,
      annotations: {
        idempotentHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.updateMetadata(params.note, params.metadata);
        return okResult(`Patched metadata (${result.degraded ? "degraded" : "normal"})`, {
          note: { path: result.path },
          metadata: result.metadata,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
        });
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "patch metadata failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.DELETE_NOTE,
    {
      description: "Delete a note by vault-relative path.",
      inputSchema: deleteNoteInputSchema,
      outputSchema: deleteNoteOutputSchema,
      annotations: {
        destructiveHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.delete(params.note);
        return okResult(`Deleted note (${result.degraded ? "degraded" : "normal"})`, {
          note: { path: params.note },
          deleted: result.deleted,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
        });
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "delete failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.GET_SEMANTIC_INDEX_STATUS,
    {
      description:
        "Inspect semantic index readiness, queue depth, and a bounded sample of pending note paths.",
      inputSchema: semanticIndexStatusInputSchema,
      outputSchema: semanticIndexStatusOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    (params) => {
      try {
        const result = noteService.getIndexStatus(params.pendingSampleLimit);
        return okResult("Retrieved semantic index status", result);
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "get semantic index status failed");
        return errorResult(domainError);
      }
    },
  );
}
