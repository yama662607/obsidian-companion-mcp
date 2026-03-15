import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerFallbackBehaviorResource(server: McpServer): void {
  server.registerResource(
    "fallback_behavior",
    {
      uri: "fallback://behavior",
      name: "Fallback Behavior",
      description: "Describes degraded-mode behavior when plugin is unavailable",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "fallback://behavior",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              degradedMode: {
                triggers: ["plugin-unreachable", "compatibility-failed"],
                noteOperations: "file-backed fallback",
                metadataOperations: "file-backed fallback",
                semanticSearch: "unavailable",
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
