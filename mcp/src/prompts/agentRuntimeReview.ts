import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PROMPT_NAMES } from "../constants/promptNames";

export function registerAgentRuntimeReviewPrompt(server: McpServer): void {
    server.registerPrompt(
        PROMPT_NAMES.AGENT_RUNTIME_REVIEW,
        {
            title: "Agent Runtime Review",
            description: "Generate a focused runtime and MCP contract review request for an agent",
            argsSchema: {
                scope: z.string().min(1).describe("Review scope, file set, or capability area"),
                severityThreshold: z.enum(["high", "medium", "low"]).default("medium"),
            },
        },
        (args) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: [
                            "You are reviewing an MCP server implementation.",
                            `Scope: ${args.scope}`,
                            `Report findings with severity >= ${args.severityThreshold}.`,
                            "Focus areas:",
                            "1) Tool contract quality (naming, schema strictness, annotations)",
                            "2) Runtime behavior (startup handshake, degraded reasons, fallback consistency)",
                            "3) Semantic indexing readiness and result interpretation",
                            "4) Resource and prompt consistency with the tool surface",
                            "Use read-only checks first, include concrete file/line references, and suggest minimal patches.",
                        ].join("\n"),
                    },
                },
            ],
        }),
    );
}
