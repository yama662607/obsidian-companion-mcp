import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { HandshakeResult } from "./contracts/protocol";
import { EditorService } from "./domain/editorService";
import { DomainError } from "./domain/errors";
import { NoteService } from "./domain/noteService";
import { SemanticService } from "./domain/semanticService";
import { discoverVaultConfigDir } from "./infra/configDir";
import { logError, logInfo } from "./infra/logger";
import { PluginClient } from "./infra/pluginClient";
import { VectorStore } from "./infra/vectorStore";
import { registerAgentRuntimeReviewPrompt } from "./prompts/agentRuntimeReview";
import { registerContextRewritePrompt } from "./prompts/contextRewrite";
import { registerSearchThenInsertPrompt } from "./prompts/searchThenInsert";
import { registerActiveEditorContextResource } from "./resources/activeEditorContext";
import { registerCapabilityMatrixResource } from "./resources/capabilityMatrix";
import { registerFallbackBehaviorResource } from "./resources/fallbackBehavior";
import { registerReviewChecklistResource } from "./resources/reviewChecklist";
import { registerRuntimeStatusResource } from "./resources/runtimeStatus";
import { registerSchemaSummaryResource } from "./resources/schemaSummary";
import { registerNoteTools } from "./tools/noteManagement";
import { registerReadEditTools } from "./tools/readEdit";
import { registerSearchTools } from "./tools/searchTools";

export interface ServerRuntime {
  server: McpServer;
  pluginClient: PluginClient;
  semanticService: SemanticService;
  vectorStore: VectorStore;
}

export function createServer(
  runtimePaths: { vaultPath: string; configDir: string },
  pluginClient = new PluginClient(),
): ServerRuntime {
  const server = new McpServer({
    name: "obsidian-companion-mcp",
    version: "0.1.0",
  });

  // Use remote (mock) embedding provider if explicitly requested (e.g. for E2E tests)
  const useRemote = process.env.USE_REMOTE_EMBEDDING === "true";

  const semanticService = new SemanticService(
    useRemote,
    runtimePaths.vaultPath,
    runtimePaths.configDir,
  );
  const vectorStore = new VectorStore(runtimePaths.vaultPath, runtimePaths.configDir);
  const editorService = new EditorService(pluginClient);
  const noteService = new NoteService(pluginClient, semanticService);

  // Registration only: all behavior remains in tools/resources/prompts/domain layers.
  registerSearchTools(server, noteService, semanticService);
  registerReadEditTools(server, noteService, editorService);
  registerNoteTools(server, noteService);

  registerCapabilityMatrixResource(server);
  registerSchemaSummaryResource(server);
  registerFallbackBehaviorResource(server);
  registerActiveEditorContextResource(server, editorService);
  registerRuntimeStatusResource(server, pluginClient);
  registerReviewChecklistResource(server);

  registerContextRewritePrompt(server);
  registerSearchThenInsertPrompt(server);
  registerAgentRuntimeReviewPrompt(server);

  return { server, pluginClient, semanticService, vectorStore };
}

async function resolveRuntimePaths(pluginClient: PluginClient): Promise<{
  vaultPath: string;
  configDir: string;
  handshake: HandshakeResult | null;
}> {
  const envVaultPath = process.env.OBSIDIAN_VAULT_PATH?.trim();
  const envConfigDir = process.env.OBSIDIAN_CONFIG_DIR?.trim();
  let handshake: HandshakeResult | null = null;

  try {
    handshake = await pluginClient.connect();
    logInfo("startup handshake completed");
  } catch (error) {
    const domainError =
      error instanceof DomainError
        ? error
        : new DomainError("INTERNAL", "startup handshake failed");
    logError(
      `startup handshake failed code=${domainError.code} correlationId=${domainError.correlationId} reason=${pluginClient.getRuntimeStatus().degradedReason ?? "n/a"}`,
    );
  }

  const vaultPath = envVaultPath ?? handshake?.vaultPath;
  if (!vaultPath) {
    throw new DomainError(
      "VALIDATION",
      "Missing required vault path. Set OBSIDIAN_VAULT_PATH or start the Obsidian Companion plugin so the vault can be discovered automatically.",
    );
  }

  const configDir =
    envConfigDir ??
    handshake?.configDir ??
    pluginClient.getConfigDir() ??
    discoverVaultConfigDir(vaultPath) ??
    "";

  if (!process.env.OBSIDIAN_VAULT_PATH) {
    process.env.OBSIDIAN_VAULT_PATH = vaultPath;
    logInfo(`applying dynamic configuration: vaultPath=${vaultPath}`);
  }

  if (configDir && !process.env.OBSIDIAN_CONFIG_DIR) {
    process.env.OBSIDIAN_CONFIG_DIR = configDir;
    logInfo(`applying dynamic configuration: configDir=${configDir}`);
  }

  return { vaultPath, configDir, handshake };
}

export async function runServer(): Promise<void> {
  const pluginClient = new PluginClient();
  const runtimePaths = await resolveRuntimePaths(pluginClient);
  const { server, semanticService, vectorStore } = createServer(runtimePaths, pluginClient);

  // Load existing index from storage
  const existingNotes = await vectorStore.load();
  semanticService.setNotes(existingNotes);

  // Handle graceful shutdown to save index
  const shutdown = async () => {
    clearInterval(saveInterval);
    logInfo("shutting down, saving vector index...");
    await vectorStore.save(semanticService.getNotes());
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Periodically save index (every 5 minutes)
  const saveInterval = setInterval(
    async () => {
      await vectorStore.save(semanticService.getNotes());
    },
    5 * 60 * 1000,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
