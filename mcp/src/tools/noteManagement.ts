import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../constants/toolNames";
import { DomainError } from "../domain/errors";
import type { NoteService } from "../domain/noteService";
import { errorResult, okResult } from "../domain/toolResult";

// Define schemas directly in the tool file to ensure Zod instances are preserved
const createNoteInputSchema = z.object({
  path: z.string().describe("Vault-relative path (e.g., 'notes/idea.md')"),
  content: z.string().describe("Full markdown content"),
});

const getNoteInputSchema = z.object({
  path: z.string().describe("Vault-relative path"),
});

const listNotesInputSchema = z.object({
  path: z
    .string()
    .optional()
    .default("")
    .describe("Vault-relative directory path. Empty string means vault root."),
  cursor: z
    .string()
    .optional()
    .describe("Opaque continuation cursor from a previous list_notes result"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(100)
    .describe("Maximum number of entries to return"),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to recurse into subdirectories"),
  includeDirs: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to include directories in the results"),
});

const moveNoteInputSchema = z.object({
  from: z.string().describe("Existing vault-relative note path"),
  to: z.string().describe("Destination vault-relative note path"),
});

const getIndexStatusInputSchema = z.object({
  pendingSampleLimit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe("Maximum number of pending paths to sample"),
});

const updateNoteContentInputSchema = z.object({
  path: z.string().describe("Vault-relative path"),
  content: z.string().describe("New full content"),
});

const deleteNoteInputSchema = z.object({
  path: z.string().describe("Vault-relative markdown note path to delete"),
});

const updateNoteMetadataInputSchema = z.object({
  path: z.string().describe("Vault-relative path"),
  metadata: z.record(z.any()).describe("Key-value pairs for frontmatter"),
});

const refreshSemanticIndexInputSchema = z.object({});

export function registerNoteTool(server: McpServer, noteService: NoteService): void {
  server.registerTool(
    TOOL_NAMES.REFRESH_SEMANTIC_INDEX,
    {
      description:
        "Build or rebuild the semantic index. This involves downloading models (if missing) and scanning all notes. This is a heavy operation for large vaults.",
      inputSchema: refreshSemanticIndexInputSchema,
    },
    async (_params) => {
      try {
        // Ensure params is received, even if empty, to satisfy SDK validation
        const stats = await noteService.refreshIndex();
        let summary = "✅ Semantic indexing queued.";
        if (!stats.modelReady) {
          summary = "❌ Failed to prepare the embedding model.";
        } else if (stats.queuedCount > 0) {
          summary += ` Found ${stats.totalFound} notes. Queued ${stats.queuedCount} note(s), processed ${stats.flushedCount} immediately, and ${stats.pendingCount} remain pending.`;
        } else {
          summary += ` Index is already up-to-date with ${stats.totalFound} notes.`;
        }
        return okResult(summary, stats);
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
      description: "Create a markdown note at the given vault-relative path.",
      inputSchema: createNoteInputSchema,
    },
    async (params) => {
      try {
        const result = await noteService.write(params.path, params.content);
        return okResult(`Created note (${result.degraded ? "degraded" : "normal"})`, result);
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
        "List notes and directories under a vault-relative folder with bounded, cursor-based pagination.",
      inputSchema: listNotesInputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.list(params.path, {
          cursor: params.cursor,
          limit: params.limit,
          recursive: params.recursive,
          includeDirs: params.includeDirs,
        });
        return okResult(`Listed ${result.entries.length} entries`, result);
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "list notes failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.GET_NOTE,
    {
      description: "Read a markdown note content and normalized metadata.",
      inputSchema: getNoteInputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.read(params.path);
        return okResult(`Read note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "get note failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.MOVE_NOTE,
    {
      description: "Move or rename a note within the vault without leaving the vault root.",
      inputSchema: moveNoteInputSchema,
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
    TOOL_NAMES.UPDATE_NOTE_CONTENT,
    {
      description: "Replace full markdown content of an existing note.",
      inputSchema: updateNoteContentInputSchema,
    },
    async (params) => {
      try {
        const result = await noteService.write(params.path, params.content);
        return okResult(
          `Updated note content (${result.degraded ? "degraded" : "normal"})`,
          result,
        );
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "update note content failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.DELETE_NOTE,
    {
      description: "Delete a note by path. This operation is destructive.",
      inputSchema: deleteNoteInputSchema,
      annotations: {
        destructiveHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.delete(params.path);
        return okResult(`Deleted note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("INTERNAL", "delete failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.UPDATE_NOTE_METADATA,
    {
      description: "Patch note metadata/frontmatter with schema-validated key-values.",
      inputSchema: updateNoteMetadataInputSchema,
      annotations: {
        idempotentHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.updateMetadata(params.path, params.metadata);
        return okResult(`Updated metadata (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "update metadata failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.GET_INDEX_STATUS,
    {
      description:
        "Inspect semantic index readiness, queue depth, and a bounded sample of pending note paths.",
      inputSchema: getIndexStatusInputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const result = await noteService.getIndexStatus(params.pendingSampleLimit);
        return okResult("Retrieved semantic index status", result);
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "get index status failed");
        return errorResult(domainError);
      }
    },
  );
}
