import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerSchemaSummaryResource(server: McpServer): void {
    server.registerResource(
        "schema_summary",
        "schema://tool-inputs",
        {
            title: "Tool Input Schemas",
            description: "Summary of strict input schema policy for bridge tools",
            mimeType: "application/json",
        },
        async (uri) => ({
            contents: [
                {
                    uri: uri.toString(),
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
