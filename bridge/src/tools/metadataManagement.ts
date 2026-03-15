import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DomainError } from "../domain/errors";
import { okResult, errorResult } from "../domain/toolResult";
import type { NoteService } from "../domain/noteService";

export function registerMetadataTool(server: McpServer, noteService: NoteService): void {
  server.registerTool(
    "manage_metadata",
    {
      description: "Update frontmatter and metadata with validation-first behavior.",
      inputSchema: z.object({
        path: z.string().min(1),
        metadata: z.record(z.unknown()),
      }),
    },
    async (params) => {
      try {
        const result = await noteService.updateMetadata(params.path, params.metadata);
        return okResult(`Updated metadata (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "metadata update failed");
        return errorResult(domainError);
      }
    },
  );
}
