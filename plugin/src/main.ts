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
  constructor(private readonly apiKey: string) {}

  async handle(request: JsonRpcRequest<unknown>, authorization?: string): Promise<JsonRpcResponse<unknown>> {
    if (request.method !== "health.ping" && authorization !== this.apiKey) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: "AUTH",
          message: "Invalid API key",
          data: { correlationId: `corr-${Date.now()}` },
        },
      };
    }

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
      const payload: EditorContextPayload = {
        activeFile: null,
        cursor: { line: 0, ch: 0 },
        selection: "",
        content: "",
      };
      return {
        jsonrpc: "2.0",
        id: request.id,
        protocolVersion: PROTOCOL_VERSION,
        result: payload,
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
  private readonly apiKey = "local-dev-key";

  async onload(): Promise<void> {
    this.host = new LocalJsonRpcHost(this.apiKey);
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {}));
  }

  onunload(): void {
    this.host = null;
  }

  getHostForTesting(): LocalJsonRpcHost | null {
    return this.host;
  }
}
