import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerContextRewritePrompt(server: McpServer): void {
    server.registerPrompt(
        "workflow_context_rewrite",
        {
            title: "Context-aware Rewrite",
            description: "Rewrite currently selected text while preserving local context",
            argsSchema: {
                style: z.string().min(1).optional(),
            },
        },
        async (args) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: [
                            "Use get_active_context to retrieve current selection and surrounding context.",
                            "Rewrite only selected text and avoid side effects.",
                            args?.style ? `Preferred style: ${args.style}` : "Preferred style: keep original tone.",
                        ].join("\n"),
                    },
                },
            ],
        }),
    );
}
