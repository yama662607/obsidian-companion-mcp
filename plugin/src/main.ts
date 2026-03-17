import { Plugin, MarkdownView, type EditorPosition, PluginSettingTab, Setting, App } from "obsidian";
import * as http from "http";
import {
    PROTOCOL_VERSION,
    type JsonRpcRequest,
    type JsonRpcResponse,
    type HandshakeResult,
} from "../../shared/protocol";

interface CompanionSettings {
    port: number;
}

const DEFAULT_SETTINGS: CompanionSettings = {
    port: 3031
};

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

class LocalJsonRpcHost {
    constructor(private plugin: ObsidianCompanionPlugin) {}

    handle(request: JsonRpcRequest<unknown>): JsonRpcResponse<unknown> {
        const { method, id } = request;

        if (method === "health.ping") {
            const result: HandshakeResult = {
                capabilities: ["health.ping", "editor.getContext", "editor.applyCommand", "notes.read"],
                availability: "normal",
                configDir: this.plugin.app.vault.configDir,
            };
            return { jsonrpc: "2.0", id, protocolVersion: PROTOCOL_VERSION, result };
        }

        if (method === "editor.getContext") {
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            return {
                jsonrpc: "2.0",
                id,
                protocolVersion: PROTOCOL_VERSION,
                result: {
                    activeFile: activeView?.file?.path ?? null,
                    cursor: activeView?.editor ? activeView.editor.getCursor() : null,
                    selection: activeView?.editor ? activeView.editor.getSelection() : "",
                    content: activeView?.editor ? activeView.editor.getValue() : "",
                }
            };
        }

        if (method === "editor.applyCommand") {
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView?.editor) {
                return {
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: "UNAVAILABLE",
                        message: "No active editor found",
                        data: { correlationId: `corr-${Date.now()}` }
                    }
                };
            }

            const payload = request.params as EditorCommandParams;
            if (payload.command === "insertText") {
                if (payload.pos.line < 0 || payload.pos.ch < 0) {
                    return {
                        jsonrpc: "2.0",
                        id,
                        error: {
                            code: "VALIDATION",
                            message: "Invalid insert position",
                            data: { correlationId: `corr-${Date.now()}` }
                        }
                    };
                }
                activeView.editor.replaceSelection(payload.text);
            } else if (payload.command === "replaceRange") {
                const invalid =
                    payload.range.from.line < 0 ||
                    payload.range.from.ch < 0 ||
                    payload.range.to.line < 0 ||
                    payload.range.to.ch < 0;
                if (invalid) {
                    return {
                        jsonrpc: "2.0",
                        id,
                        error: {
                            code: "VALIDATION",
                            message: "Invalid replace range",
                            data: { correlationId: `corr-${Date.now()}` }
                        }
                    };
                }
                activeView.editor.replaceRange(payload.text, payload.range.from, payload.range.to);
            }

            return {
                jsonrpc: "2.0",
                id,
                protocolVersion: PROTOCOL_VERSION,
                result: { success: true }
            };
        }

        return {
            jsonrpc: "2.0",
            id,
            error: {
                code: "METHOD_NOT_FOUND",
                message: `Method ${method} not supported`,
                data: { correlationId: `corr-${Date.now()}` }
            }
        };
    }
}

export default class ObsidianCompanionPlugin extends Plugin {
    settings: CompanionSettings = DEFAULT_SETTINGS;
    private host: LocalJsonRpcHost | null = null;
    private server: http.Server | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.host = new LocalJsonRpcHost(this);
        this.addSettingTab(new CompanionSettingTab(this.app, this));
        
        this.startServer();

        this.addStatusBarItem().setText(`Companion MCP: Port ${this.settings.port}`);
        console.log(`Obsidian Companion MCP Plugin loaded on port ${this.settings.port}`);
    }

    onunload(): void {
        this.stopServer();
        console.log("Obsidian Companion MCP Plugin unloaded");
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.restartServer();
    }

    private startServer(): void {
        this.server = http.createServer((req, res) => {
            // Only allow localhost
            const remoteAddress = req.socket.remoteAddress;
            if (remoteAddress !== "127.0.0.1" && remoteAddress !== "::1" && remoteAddress !== "::ffff:127.0.0.1") {
                res.writeHead(403);
                res.end("Forbidden: Localhost only");
                return;
            }

            if (req.method === "POST") {
                let body = "";
                req.on("data", chunk => { body += chunk; });
                req.on("end", () => {
                    try {
                        const request = JSON.parse(body) as JsonRpcRequest<unknown>;
                        const response = this.host?.handle(request);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify(response));
                    } catch (e) {
                        res.writeHead(400);
                        res.end("Invalid JSON-RPC request");
                    }
                });
            } else {
                res.writeHead(405);
                res.end("Method Not Allowed");
            }
        });

        this.server.listen(this.settings.port, "127.0.0.1");
    }

    private stopServer(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    private restartServer(): void {
        this.stopServer();
        this.startServer();
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
        containerEl.createEl("h2", { text: "Companion MCP Settings" });

        new Setting(containerEl)
            .setName("Port")
            .setDesc("The port the local JSON-RPC server will listen on.")
            .addText(text => text
                .setPlaceholder("3031")
                .setValue(this.plugin.settings.port.toString())
                .onChange(async (value) => {
                    const port = parseInt(value);
                    if (!isNaN(port)) {
                        this.plugin.settings.port = port;
                        await this.plugin.saveSettings();
                    }
                }));
    }
}
