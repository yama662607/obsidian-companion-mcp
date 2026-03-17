import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_URIS } from "../constants/resourceUris";

export function registerSchemaSummaryResource(server: McpServer): void {
    server.registerResource(
        "schema_summary",
        RESOURCE_URIS.SCHEMA_SUMMARY,
        {
            title: "Tool Input Schemas",
            description: "Summary of strict input schema policy for mcp tools",
            mimeType: "application/json",
        },
         (uri) => ({
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
