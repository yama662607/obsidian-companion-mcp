import {
  PROTOCOL_VERSION,
  isJsonRpcFailure,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type HandshakeResult,
} from "../contracts/protocol";
import { DomainError } from "../domain/errors";
import { logInfo } from "./logger";

export type Availability = "normal" | "degraded" | "unavailable";

export class PluginClient {
  private availability: Availability = "unavailable";
  private retryCount = 0;

  constructor(private readonly maxRetries = 3) {}

  async connect(apiKey: string): Promise<HandshakeResult> {
    if (!apiKey) {
      this.availability = "unavailable";
      throw new DomainError("AUTH", "API key is required to connect plugin");
    }

    while (this.retryCount < this.maxRetries) {
      this.retryCount += 1;
      const result: HandshakeResult = {
        capabilities: [
          "semantic.search",
          "editor.getContext",
          "editor.applyCommand",
          "notes.read",
          "notes.write",
          "metadata.update",
        ],
        availability: "normal",
      };
      this.availability = "normal";
      logInfo(`plugin connected on retry ${this.retryCount}`);
      return result;
    }

    this.availability = "degraded";
    throw new DomainError("UNAVAILABLE", "Plugin connection retries exceeded");
  }

  getAvailability(): Availability {
    return this.availability;
  }

  async send<TParams, TResult>(method: string, params?: TParams): Promise<TResult> {
    if (this.availability === "unavailable") {
      throw new DomainError("UNAVAILABLE", "Plugin is unavailable");
    }

    const request: JsonRpcRequest<TParams> = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
      protocolVersion: PROTOCOL_VERSION,
    };

    const response = await this.mockResponse<TResult>(request);
    if (isJsonRpcFailure(response)) {
      throw new DomainError(response.error.code as never, response.error.message, response.error.data.correlationId);
    }

    return response.result;
  }

  private async mockResponse<TResult>(request: JsonRpcRequest<unknown>): Promise<JsonRpcResponse<TResult>> {
    return {
      jsonrpc: "2.0",
      id: request.id,
      protocolVersion: PROTOCOL_VERSION,
      result: {} as TResult,
    };
  }
}
