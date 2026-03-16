import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DomainError } from "../domain/errors";
import { okResult, errorResult } from "../domain/toolResult";
import type { NoteService } from "../domain/noteService";

export function registerNoteTool(server: McpServer, noteService: NoteService): void {
    server.registerTool(
        "manage_note",
        {
            description: "Create, read, update, or delete markdown notes with fallback support.",
            inputSchema: z.object({
                action: z.enum(["create", "read", "update", "delete"]),
                path: z.string().min(1),
                content: z.string().optional(),
            }),
        },
        async (params) => {
            try {
                if (params.action === "read") {
                    const result = await noteService.read(params.path);
                    return okResult(`Read note (${result.degraded ? "degraded" : "normal"})`, result);
                }
                if (params.action === "delete") {
                    const result = await noteService.delete(params.path);
                    return okResult(`Deleted note (${result.degraded ? "degraded" : "normal"})`, result);
                }

                const content = params.content ?? "";
                const result = await noteService.write(params.path, content);
                return okResult(`Stored note (${result.degraded ? "degraded" : "normal"})`, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "note operation failed");
                return errorResult(domainError);
            }
        },
    );

    server.registerTool(
        "delete_note",
        {
            description: "Delete a note by path. This operation is destructive.",
            inputSchema: z.object({
                path: z.string().min(1).describe("Vault-relative markdown note path to delete"),
            }),
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
            },
        },
        async (params) => {
            try {
                const result = await noteService.delete(params.path);
                return okResult(`Deleted note (${result.degraded ? "degraded" : "normal"})`, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "delete failed");
                return errorResult(domainError);
            }
        },
    );
}
