import { Plugin } from "obsidian";
import {
    PROTOCOL_VERSION,
    type JsonRpcRequest,
    type JsonRpcResponse,
    type HandshakeResult,
} from "../../shared/protocol";

type EditorContextPayload = {
    activeFile: string | null;
    cursor: { line: number; ch: number } | null;
    selection: string;
    content: string;
};

class LocalJsonRpcHost {
    private context: EditorContextPayload = {
        activeFile: null,
        cursor: { line: 0, ch: 0 },
        selection: "",
        content: "",
    };

    async handle(request: JsonRpcRequest<unknown>): Promise<JsonRpcResponse<unknown>> {

        if (request.method === "health.ping") {
            const result: HandshakeResult = {
                capabilities: ["health.ping", "editor.getContext", "editor.applyCommand", "semantic.search", "notes.read"],
                availability: "normal",
            };
            return {
                jsonrpc: "2.0",
                id: request.id,
                protocolVersion: PROTOCOL_VERSION,
                result,
            };
        }

        if (request.method === "editor.getContext") {
            return {
                jsonrpc: "2.0",
                id: request.id,
                protocolVersion: PROTOCOL_VERSION,
                result: this.context,
            };
        }

        if (request.method === "editor.applyCommand") {
            const payload = request.params as
                | {
                    command: "insertText";
                    text: string;
                    pos: { line: number; ch: number };
                }
                | {
                    command: "replaceRange";
                    text: string;
                    range: { from: { line: number; ch: number }; to: { line: number; ch: number } };
                };

            if (payload.command === "insertText") {
                if (payload.pos.line < 0 || payload.pos.ch < 0) {
                    return {
                        jsonrpc: "2.0",
                        id: request.id,
                        error: {
                            code: "VALIDATION",
                            message: "Invalid insert position",
                            data: { correlationId: `corr-${Date.now()}` },
                        },
                    };
                }
                this.context = {
                    ...this.context,
                    content: `${this.context.content}${payload.text}`,
                    cursor: payload.pos,
                };
            }

            if (payload.command === "replaceRange") {
                const invalid =
                    payload.range.from.line < 0 ||
                    payload.range.from.ch < 0 ||
                    payload.range.to.line < 0 ||
                    payload.range.to.ch < 0;
                if (invalid) {
                    return {
                        jsonrpc: "2.0",
                        id: request.id,
                        error: {
                            code: "VALIDATION",
                            message: "Invalid replace range",
                            data: { correlationId: `corr-${Date.now()}` },
                        },
                    };
                }
                this.context = {
                    ...this.context,
                    content: payload.text,
                    cursor: payload.range.to,
                };
            }

            return {
                jsonrpc: "2.0",
                id: request.id,
                protocolVersion: PROTOCOL_VERSION,
                result: this.context,
            };
        }

        return {
            jsonrpc: "2.0",
            id: request.id,
            protocolVersion: PROTOCOL_VERSION,
            result: {},
        };
    }
}

export default class ObsidianCompanionPlugin extends Plugin {
    private host: LocalJsonRpcHost | null = null;

    async onload(): Promise<void> {
        this.host = new LocalJsonRpcHost();
        this.registerEvent(this.app.workspace.on("active-leaf-change", () => { }));
    }

    onunload(): void {
        this.host = null;
    }

    getHostForTesting(): LocalJsonRpcHost | null {
        return this.host;
    }
}
