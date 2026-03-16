import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { okResult, errorResult } from "../domain/toolResult";
import { DomainError } from "../domain/errors";
import type { SemanticService } from "../domain/semanticService";
import { TOOL_NAMES } from "../constants/toolNames";

export function registerSemanticSearchTool(server: McpServer, semanticService: SemanticService): void {
    server.registerTool(
        TOOL_NAMES.SEARCH_NOTES_SEMANTIC,
        {
            description: "Search notes semantically and return ranked matches with snippets.",
            inputSchema: z.object({
                query: z.string().min(1).describe("Semantic search query text"),
                limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of ranked matches"),
            }),
            annotations: {
                readOnlyHint: true,
            },
        },
        async (params) => {
            try {
                const result = await semanticService.searchWithStatus(params.query, params.limit);
                const summary = result.matches.length > 0
                    ? `Found ${result.matches.length} matches`
                    : result.indexStatus.ready
                        ? (result.indexStatus.isEmpty
                            ? "Index is empty (no notes indexed)"
                            : "No semantic matches found")
                        : `Index not ready (${result.indexStatus.pendingCount} pending)`;

                return okResult(summary, result);
            } catch (error) {
                const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "semantic search failed");
                return errorResult(domainError);
            }
        },
    );
}
