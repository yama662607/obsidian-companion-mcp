import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PROMPT_NAMES } from "../constants/promptNames";
import { TOOL_NAMES } from "../constants/toolNames";

export function registerSearchThenInsertPrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAMES.SEARCH_THEN_INSERT,
    {
      title: "Search Then Insert",
      description: "Find relevant context semantically and apply a concise edit to the active note",
      argsSchema: {
        query: z.string().min(1),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Run ${TOOL_NAMES.SEMANTIC_SEARCH_NOTES} with query: ${args.query}`,
              "Summarize the highest-ranked result in one sentence.",
              `Read the active buffer with ${TOOL_NAMES.READ_ACTIVE_CONTEXT}, then apply the summary to a relevant active target via ${TOOL_NAMES.EDIT_NOTE}.`,
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
