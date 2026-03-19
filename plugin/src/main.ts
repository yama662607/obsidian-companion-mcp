import type { IncomingMessage, ServerResponse } from "node:http";
import * as http from "node:http";
import {
  type App,
  type EditorPosition,
  FileSystemAdapter,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import { validateEditorPosition, validateEditorRange } from "../../shared/editorPositions";
import { applyFrontmatter, parseFrontmatter } from "../../shared/frontmatter";
import {
  type HandshakeResult,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
  PROTOCOL_VERSION,
} from "../../shared/protocol";

interface CompanionSettings {
  port: number;
}

const DEFAULT_SETTINGS: CompanionSettings = {
  port: 3033,
};

const MIN_PORT = 1024;
const MAX_PORT = 49151;

interface InsertTextParams {
  command: "insertText";
  text: string;
  pos: EditorPosition;
}

interface ReplaceRangeParams {
  command: "replaceRange";
  text: string;
  range: { from: EditorPosition; to: EditorPosition };
}

type EditorCommandParams = InsertTextParams | ReplaceRangeParams;

interface NotesWriteParams {
  path: string;
  content: string;
}

interface NotesReadParams {
  path: string;
}

interface NotesDeleteParams {
  path: string;
}

interface NotesMoveParams {
  from: string;
  to: string;
}

interface MetadataUpdateParams {
  path: string;
  metadata: Record<string, unknown>;
}

interface LocalServerHandle {
  close(callback?: () => void): void;
  listen(port: number, hostname: string, listeningListener?: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

function isMissingVaultFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

class LocalJsonRpcHost {
  constructor(private plugin: ObsidianCompanionPlugin) {}

  async handle(request: JsonRpcRequest<unknown>): Promise<JsonRpcResponse<unknown>> {
    const { method, id } = request;

    try {
      switch (method) {
        case "health.ping":
          return this.handleHealthPing(id);
        case "editor.getContext":
          return this.handleGetEditorContext(id);
        case "notes.write":
          return await this.handleNotesWrite(id, request.params as NotesWriteParams);
        case "notes.read":
          return await this.handleNotesRead(id, request.params as NotesReadParams);
        case "notes.delete":
          return await this.handleNotesDelete(id, request.params as NotesDeleteParams);
        case "notes.move":
          return await this.handleNotesMove(id, request.params as NotesMoveParams);
        case "metadata.update":
          return await this.handleMetadataUpdate(id, request.params as MetadataUpdateParams);
        case "editor.applyCommand":
          return this.handleEditorApplyCommand(id, request.params as EditorCommandParams);
        default:
          return this.methodNotFound(id, method);
      }
    } catch (error) {
      return this.handleError(id, error);
    }
  }

  private handleHealthPing(id: JsonRpcId): JsonRpcResponse<HandshakeResult> {
    const result: HandshakeResult = {
      capabilities: [
        "health.ping",
        "editor.getContext",
        "editor.applyCommand",
        "notes.read",
        "notes.write",
        "notes.delete",
        "notes.move",
        "metadata.update",
      ],
      availability: "normal",
      configDir: this.plugin.app.vault.configDir,
      vaultPath: this.plugin.getVaultBasePath(),
    };
    return { jsonrpc: "2.0", id, protocolVersion: PROTOCOL_VERSION, result };
  }

  private handleGetEditorContext(id: JsonRpcId): JsonRpcResponse<unknown> {
    const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: {
        activeFile: activeView?.file?.path ?? null,
        cursor: activeView?.editor ? activeView.editor.getCursor() : null,
        selection: activeView?.editor ? activeView.editor.getSelection() : "",
        selectionRange:
          activeView?.editor && activeView.editor.getSelection().length > 0
            ? {
                from: activeView.editor.getCursor("from"),
                to: activeView.editor.getCursor("to"),
              }
            : null,
        content: activeView?.editor ? activeView.editor.getValue() : "",
      },
    };
  }

  private async handleNotesWrite(
    id: JsonRpcId,
    params: NotesWriteParams,
  ): Promise<JsonRpcResponse<unknown>> {
    if (!params?.path) {
      return this.validationError(id, "Path is required");
    }
    if (params.content === undefined) {
      return this.validationError(id, "Content is required");
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (file) {
      if (!(file instanceof TFile)) {
        return this.errorResponse(id, "INTERNAL", "Target is not a file");
      }
      await this.plugin.app.vault.modify(file, params.content);
    } else {
      await this.plugin.app.vault.create(params.path, params.content);
    }

    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { success: true },
    };
  }

  private async handleNotesRead(
    id: JsonRpcId,
    params: NotesReadParams,
  ): Promise<JsonRpcResponse<unknown>> {
    if (!params?.path) {
      return this.validationError(id, "Path is required");
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (!file || !(file instanceof TFile)) {
      return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
    }

    let content: string;
    try {
      // Use cachedRead for better performance
      content = await this.plugin.app.vault.cachedRead(file);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }

    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { content },
    };
  }

  private async handleNotesDelete(
    id: JsonRpcId,
    params: NotesDeleteParams,
  ): Promise<JsonRpcResponse<unknown>> {
    if (!params?.path) {
      return this.validationError(id, "Path is required");
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (!file) {
      return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
    }

    try {
      await this.plugin.app.vault.delete(file);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }

    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { success: true },
    };
  }

  private async handleNotesMove(
    id: JsonRpcId,
    params: NotesMoveParams,
  ): Promise<JsonRpcResponse<unknown>> {
    if (!params?.from || !params?.to) {
      return this.validationError(id, "Source and destination paths are required");
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(params.from);
    if (!file || !(file instanceof TFile)) {
      return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.from}`);
    }

    const existingTarget = this.plugin.app.vault.getAbstractFileByPath(params.to);
    if (existingTarget) {
      return this.errorResponse(id, "CONFLICT", `Destination already exists: ${params.to}`);
    }

    try {
      await this.plugin.app.vault.rename(file, params.to);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.from}`);
      }
      throw error;
    }

    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { success: true, path: params.to },
    };
  }

  private async handleMetadataUpdate(
    id: JsonRpcId,
    params: MetadataUpdateParams,
  ): Promise<JsonRpcResponse<unknown>> {
    if (!params?.path) {
      return this.validationError(id, "Path is required");
    }
    if (!params?.metadata || typeof params.metadata !== "object") {
      return this.validationError(id, "Valid metadata object is required");
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(params.path);
    if (!file || !(file instanceof TFile)) {
      return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
    }

    let content: string;
    try {
      // Use cachedRead for better performance
      content = await this.plugin.app.vault.cachedRead(file);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }

    const newContent = this.updateFrontmatter(content, params.metadata);
    try {
      await this.plugin.app.vault.modify(file, newContent);
    } catch (error) {
      if (isMissingVaultFileError(error)) {
        return this.errorResponse(id, "NOT_FOUND", `Note not found: ${params.path}`);
      }
      throw error;
    }

    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: { success: true },
    };
  }

  private handleEditorApplyCommand(
    id: JsonRpcId,
    payload: EditorCommandParams,
  ): JsonRpcResponse<unknown> {
    const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView?.editor) {
      return this.errorResponse(id, "UNAVAILABLE", "No active editor found");
    }

    const content = activeView.editor.getValue();

    if (payload.command === "insertText") {
      const validationError = validateEditorPosition(content, payload.pos, "Insert position");
      if (validationError) {
        return this.validationError(id, validationError);
      }
      activeView.editor.setCursor(payload.pos);
      activeView.editor.replaceSelection(payload.text);
    } else if (payload.command === "replaceRange") {
      const validationError = validateEditorRange(content, payload.range);
      if (validationError) {
        return this.validationError(id, validationError);
      }

      // Debug logging
      const lines = content.split("\n");
      console.debug("[replaceRange DEBUG]", {
        from: payload.range.from,
        to: payload.range.to,
        text: payload.text,
        "from.line content": lines[payload.range.from.line] || "(undefined)",
        "to.line content": lines[payload.range.to.line] || "(undefined)",
        "from.line length": lines[payload.range.from.line]?.length || 0,
        "to.line length": lines[payload.range.to.line]?.length || 0,
      });

      activeView.editor.replaceRange(payload.text, payload.range.from, payload.range.to);
    }

    return {
      jsonrpc: "2.0",
      id,
      protocolVersion: PROTOCOL_VERSION,
      result: {
        activeFile: activeView?.file?.path ?? null,
        cursor: activeView.editor.getCursor(),
        selection: activeView.editor.getSelection(),
        selectionRange:
          activeView.editor.getSelection().length > 0
            ? {
                from: activeView.editor.getCursor("from"),
                to: activeView.editor.getCursor("to"),
              }
            : null,
        content: activeView.editor.getValue(),
      },
    };
  }

  private methodNotFound(id: JsonRpcId, method: string): JsonRpcResponse<unknown> {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: "METHOD_NOT_FOUND",
        message: `Method ${method} not supported`,
        data: { correlationId: `corr-${Date.now()}` },
      },
    };
  }

  private validationError(id: JsonRpcId, message: string): JsonRpcResponse<unknown> {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: "VALIDATION",
        message,
        data: { correlationId: `corr-${Date.now()}` },
      },
    };
  }

  private errorResponse(id: JsonRpcId, code: string, message: string): JsonRpcResponse<unknown> {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        data: { correlationId: `corr-${Date.now()}` },
      },
    };
  }

  private handleError(id: JsonRpcId, error: unknown): JsonRpcResponse<unknown> {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return this.errorResponse(id, "INTERNAL", message);
  }

  /**
   * Update frontmatter in content. Preserves existing frontmatter structure.
   */
  private updateFrontmatter(content: string, metadata: Record<string, unknown>): string {
    return applyFrontmatter(content, { ...parseFrontmatter(content), ...metadata });
  }
}

export default class ObsidianCompanionPlugin extends Plugin {
  settings: CompanionSettings = DEFAULT_SETTINGS;
  private host: LocalJsonRpcHost | null = null;
  private server: LocalServerHandle | null = null;
  private statusBarElement: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.debug("Companion MCP: plugin loading");

    await this.loadSettings();

    // Validate settings
    if (!this.isValidPort(this.settings.port)) {
      new Notice("Invalid port in settings; using default.");
      this.settings.port = DEFAULT_SETTINGS.port;
      await this.saveSettings();
    }

    this.host = new LocalJsonRpcHost(this);
    this.addSettingTab(new CompanionSettingTab(this.app, this));

    // Add status bar item with reference for cleanup
    this.statusBarElement = this.addStatusBarItem();
    this.updateStatusBar();

    // Start server after workspace is ready to improve load time
    this.app.workspace.onLayoutReady(() => {
      this.startServer();
    });

    console.debug(`Companion MCP: plugin loaded, will start server on port ${this.settings.port}`);
  }

  onunload(): void {
    this.stopServer();

    // Clean up status bar
    if (this.statusBarElement) {
      this.statusBarElement.remove();
      this.statusBarElement = null;
    }

    console.debug("Companion MCP: plugin unloaded");
  }

  async loadSettings(): Promise<void> {
    const savedSettings = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  }

  async saveSettings(): Promise<void> {
    // Validate before saving
    if (!this.isValidPort(this.settings.port)) {
      new Notice("Invalid port number.");
      return;
    }

    await this.saveData(this.settings);

    // Only restart server if already running (after initial load)
    if (this.server) {
      this.restartServer();
    }
  }

  public getServerStatus(): boolean {
    return this.server !== null;
  }

  public updateStatusBar(): void {
    if (this.statusBarElement) {
      this.statusBarElement.setText(`Companion MCP: port ${this.settings.port}`);
    }
  }

  public getVaultBasePath(): string | undefined {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return undefined;
  }

  private startServer(): void {
    if (!this.settings.port || !this.isValidPort(this.settings.port)) {
      new Notice("Invalid port. Cannot start server.");
      return;
    }

    try {
      if (this.server) {
        this.server.close();
        this.server = null;
      }

      this.server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        void this.handleRequest(req, res);
      });

      this.server.on("error", (error: Error) => {
        this.handleServerError(error);
      });

      this.server.listen(this.settings.port, "127.0.0.1", () => {
        const msg = `Companion MCP: server active on port ${this.settings.port}`;
        console.debug(msg);
        new Notice(msg);
      });
    } catch (error) {
      this.handleServerError(error);
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Security: Only allow localhost
    if (!this.isLocalRequest(req)) {
      const remoteAddress = req.socket.remoteAddress || "unknown";
      console.warn(`Companion MCP: Rejected connection from ${remoteAddress}`);
      res.writeHead(403);
      res.end("Forbidden: Localhost only");
      return;
    }

    if (req.method === "POST") {
      let body = "";
      let rpcMethod = "unknown";
      let rpcId: JsonRpcId | null = null;

      try {
        for await (const chunk of req) {
          body += chunk.toString();
        }

        const request = JSON.parse(body) as JsonRpcRequest<unknown>;
        rpcMethod = request.method;
        rpcId = request.id;
        const response = await this.host?.handle(request);

        if (response && "error" in response) {
          console.warn(
            `Companion MCP: rpc error method=${rpcMethod} id=${String(rpcId)} code=${response.error.code} correlationId=${response.error.data?.correlationId ?? "unknown"}`,
          );
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (error) {
        console.error(
          `Companion MCP: request handling error http=${req.method ?? "unknown"} rpc=${rpcMethod} id=${String(rpcId ?? "unknown")}`,
          error,
        );
        res.writeHead(400);
        res.end("Invalid JSON-RPC request");
      }
    } else {
      res.writeHead(405);
      res.end("Method Not Allowed");
    }
  }

  private handleServerError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Companion MCP: server error port=${this.settings.port}`, error);
    new Notice(`Companion MCP error: ${message}`);
  }

  private stopServer(): void {
    if (this.server) {
      this.server.close(() => {
        console.debug("Companion MCP: server stopped");
      });
      this.server = null;
    }
  }

  public restartServer(): void {
    this.stopServer();

    // Wait for server to fully stop before restarting
    setTimeout(() => {
      this.startServer();
    }, 100);
  }

  private isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
  }

  private isLocalRequest(req: IncomingMessage): boolean {
    const remoteAddress = req.socket.remoteAddress || "";
    const hostHeader = req.headers.host || "";

    return (
      remoteAddress.includes("127.0.0.1") ||
      remoteAddress.includes("::1") ||
      remoteAddress.includes("localhost") ||
      hostHeader.includes("127.0.0.1") ||
      hostHeader.includes("localhost")
    );
  }
}

class CompanionSettingTab extends PluginSettingTab {
  plugin: ObsidianCompanionPlugin;

  constructor(app: App, plugin: ObsidianCompanionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Server").setHeading();

    new Setting(containerEl)
      .setName("Server port")
      .setDesc(
        `The port for the local JSON-RPC server. Must be between ${MIN_PORT} and ${MAX_PORT}. Default: ${DEFAULT_SETTINGS.port}`,
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.port.toString())
          .setValue(this.plugin.settings.port.toString())
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (!Number.isNaN(port) && port >= MIN_PORT && port <= MAX_PORT) {
              this.plugin.settings.port = port;
              await this.plugin.saveSettings();
              this.plugin.updateStatusBar();
            }
          }),
      );

    const isServerRunning = this.plugin.getServerStatus();
    new Setting(containerEl)
      .setName("Server status")
      .setDesc(isServerRunning ? "Server is running" : "Server is stopped")
      .addButton((button) =>
        button.setButtonText("Restart server").onClick(() => {
          this.plugin.restartServer();
          new Notice("Server restarted.");
        }),
      );

    containerEl.createEl("p", {
      text: "Provides local access for AI agents. Only localhost connections are allowed.",
    });
  }
}
