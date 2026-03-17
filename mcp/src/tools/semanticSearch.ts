import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DomainError } from "../domain/errors";
import { okResult, errorResult } from "../domain/toolResult";
import { TOOL_NAMES } from "../constants/toolNames";
import type { SemanticService } from "../domain/semanticService";

const searchNotesSemanticInputSchema = z.object({
    query: z.string().describe("Natural language search query (multilingual)"),
    limit: z.number().optional().default(10).describe("Maximum number of results to return"),
});

export function registerSemanticSearchTool(server: McpServer, semanticService: SemanticService): void {
    server.registerTool(
        TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
        {
            description: "Perform semantic (vector-based) search on your notes.",
            inputSchema: searchNotesSemanticInputSchema,
        },
        async (params) => {
            try {
                const result = await semanticService.searchWithStatus(params.query, params.limit);
                let summary: string;
                let instructions: string | null = null;

                if (result.matches.length > 0) {
                    summary = `Found ${result.matches.length} matches`;
                } else if (result.indexStatus.isEmpty) {
                    instructions = "Vault has not been indexed yet. Please run 'refresh_semantic_index' tool to create the initial index.";
                    summary = instructions;
                } else if (result.indexStatus.ready) {
                    summary = "No semantic matches found";
                } else {
                    summary = `Index not ready (${result.indexStatus.pendingCount} pending)`;
                }

                return okResult(summary, {
                    ...result,
                    instructions,
                    degraded: false,
                    degradedReason: null,
                });
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "semantic search failed");
                return errorResult(domainError);
            }
        },
    );
}
