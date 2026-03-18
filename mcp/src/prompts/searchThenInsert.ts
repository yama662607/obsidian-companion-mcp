import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PROMPT_NAMES } from "../constants/promptNames";
import { TOOL_NAMES } from "../constants/toolNames";

export function registerSearchThenInsertPrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAMES.SEARCH_THEN_INSERT,
    {
      title: "Search Then Insert",
      description: "Find relevant context semantically and insert a concise note at cursor",
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
              `Run ${TOOL_NAMES.SEARCH_NOTES_SEMANTIC} with query: ${args.query}`,
              "Summarize the highest-ranked result in one sentence.",
              `Insert that summary via ${TOOL_NAMES.INSERT_AT_CURSOR}.`,
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
