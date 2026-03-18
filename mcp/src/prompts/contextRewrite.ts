import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_NAMES } from "../constants/toolNames";
import { PROMPT_NAMES } from "../constants/promptNames";

export function registerContextRewritePrompt(server: McpServer): void {
    server.registerPrompt(
        PROMPT_NAMES.CONTEXT_REWRITE,
        {
            title: "Context-aware Rewrite",
            description: "Rewrite currently selected text while preserving local context",
            argsSchema: {
                style: z.string().min(1).optional(),
            },
        },
        (args) => {
            const style = typeof args.style === "string" && args.style.trim().length > 0
                ? args.style
                : "keep original tone";

            return {
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: [
                                `Use ${TOOL_NAMES.GET_ACTIVE_CONTEXT} to retrieve current selection and surrounding context.`,
                                "Rewrite only selected text and avoid side effects.",
                                `Preferred style: ${style}.`,
                            ].join("\n"),
                        },
                    },
                ],
            };
        },
    );
}
