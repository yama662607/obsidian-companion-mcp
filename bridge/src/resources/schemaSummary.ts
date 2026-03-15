import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerSchemaSummaryResource(server: McpServer): void {
  server.registerResource(
    "schema_summary",
    {
      uri: "schema://tool-inputs",
      name: "Tool Input Schemas",
      description: "Summary of strict input schema policy for bridge tools",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "schema://tool-inputs",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              policy: {
                requiresZodObject: true,
                requiresEnumForFiniteValues: true,
                requiresBoundedLimit: true,
                disallowAny: true,
              },
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}
