import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PluginClient } from "./infra/pluginClient";
import { EditorService } from "./domain/editorService";
import { SemanticService } from "./domain/semanticService";
import { NoteService } from "./domain/noteService";
import { registerSemanticSearchTool } from "./tools/semanticSearch";
import { registerEditorTools } from "./tools/editorCommands";
import { registerNoteTool } from "./tools/noteManagement";
import { registerMetadataTool } from "./tools/metadataManagement";
import { registerCapabilityMatrixResource } from "./resources/capabilityMatrix";
import { registerSchemaSummaryResource } from "./resources/schemaSummary";
import { registerFallbackBehaviorResource } from "./resources/fallbackBehavior";
import { registerActiveEditorContextResource } from "./resources/activeEditorContext";
import { registerRuntimeStatusResource } from "./resources/runtimeStatus";
import { registerContextRewritePrompt } from "./prompts/contextRewrite";
import { registerSearchThenInsertPrompt } from "./prompts/searchThenInsert";
import { logError, logInfo } from "./infra/logger";
import { DomainError } from "./domain/errors";

export interface ServerRuntime {
    server: McpServer;
    pluginClient: PluginClient;
}

export function createServer(): ServerRuntime {
    const server = new McpServer({
        name: "obsidian-companion-bridge",
        version: "0.1.0",
    });

    const pluginClient = new PluginClient();
    const editorService = new EditorService(pluginClient);
    const semanticService = new SemanticService();
    const noteService = new NoteService(pluginClient);

    // Registration only: all behavior remains in tools/resources/prompts/domain layers.
    registerSemanticSearchTool(server, semanticService);
    registerEditorTools(server, editorService);
    registerNoteTool(server, noteService);
    registerMetadataTool(server, noteService);

    registerCapabilityMatrixResource(server);
    registerSchemaSummaryResource(server);
    registerFallbackBehaviorResource(server);
    registerActiveEditorContextResource(server, editorService);
    registerRuntimeStatusResource(server, pluginClient);

    registerContextRewritePrompt(server);
    registerSearchThenInsertPrompt(server);

    return { server, pluginClient };
}

export async function runServer(): Promise<void> {
    const { server, pluginClient } = createServer();
    const apiKey = process.env.OBSIDIAN_COMPANION_API_KEY ?? "local-dev-key";

    try {
        await pluginClient.connect(apiKey);
        logInfo("startup handshake completed");
    } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "startup handshake failed");
        logError(
            `startup handshake failed code=${domainError.code} correlationId=${domainError.correlationId} reason=${pluginClient.getRuntimeStatus().degradedReason ?? "n/a"}`,
        );
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
