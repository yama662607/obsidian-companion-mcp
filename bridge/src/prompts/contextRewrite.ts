import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerContextRewritePrompt(server: McpServer): void {
  server.registerPrompt(
    "workflow_context_rewrite",
    {
      name: "Context-aware Rewrite",
      description: "Rewrite currently selected text while preserving local context",
      arguments: [
        {
          name: "style",
          description: "Desired writing style",
          required: false,
        },
      ],
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
