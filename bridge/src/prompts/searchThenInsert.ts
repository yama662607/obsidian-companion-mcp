import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerSearchThenInsertPrompt(server: McpServer): void {
    server.registerPrompt(
        "workflow_search_then_insert",
        {
            title: "Search Then Insert",
            description: "Find relevant context semantically and insert a concise note at cursor",
            argsSchema: {
                query: z.string().min(1),
            },
        },
        async (args) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: [
                            `Run semantic_search with query: ${args.query}`,
                            "Summarize the highest-ranked result in one sentence.",
                            "Insert that summary via insert_at_cursor.",
                        ].join("\n"),
                    },
                },
            ],
        }),
    );
}
