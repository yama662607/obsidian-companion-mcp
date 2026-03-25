import http from "node:http";
import https from "node:https";
import {
  type HandshakeResult,
  isJsonRpcFailure,
  type JsonRpcRequest,
  type JsonRpcResponse,
  PROTOCOL_VERSION,
} from "../contracts/protocol";
import { DomainError } from "../domain/errors";
import { logInfo } from "./logger";

export type Availability = "normal" | "degraded" | "unavailable";

export type AvailabilityReason =
  | "startup_not_attempted"
  | "protocol_mismatch"
  | "retry_exhausted"
  | "plugin_unavailable";

export interface PluginRuntimeStatus {
  availability: Availability;
  degradedReason: AvailabilityReason | null;
  retryCount: number;
  lastCorrelationId: string | null;
}

export class PluginClient {
  private availability: Availability = "unavailable";
  private degradedReason: AvailabilityReason | null = "startup_not_attempted";
  private lastCorrelationId: string | null = null;
  private retryCount = 0;
  private readonly pluginUrl: string;
  private configDir: string | null = null;

  constructor(
    private readonly maxRetries = 3,
    private readonly expectedProtocolVersion = PROTOCOL_VERSION,
  ) {
    const port = process.env.OBSIDIAN_PLUGIN_PORT || "3033";
    this.pluginUrl = `http://127.0.0.1:${port}`;
    this.configDir = process.env.OBSIDIAN_CONFIG_DIR || null;
  }

  async connect(): Promise<HandshakeResult> {
    this.retryCount = 0;

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      this.retryCount = attempt;

      try {
        const result = await this.performHandshake();
        const receivedProtocolVersion = result.protocolVersion ?? PROTOCOL_VERSION;

        if (receivedProtocolVersion !== this.expectedProtocolVersion) {
          const error = new DomainError(
            "CONFLICT",
            `Protocol version mismatch: expected ${this.expectedProtocolVersion}, got ${receivedProtocolVersion}`,
          );
          this.transition("degraded", "protocol_mismatch", error.correlationId);
          throw error;
        }

        if (result.configDir) {
          this.configDir = result.configDir;
          logInfo(`plugin reported config directory: ${this.configDir}`);
        }

        this.transition("normal", null, null);
        logInfo(`plugin connected on attempt ${attempt}/${this.maxRetries}`);
        return result;
      } catch (error) {
        if (error instanceof DomainError && error.code === "CONFLICT") {
          throw error;
        }

        if (attempt < this.maxRetries) {
          logInfo(`plugin handshake retry ${attempt}/${this.maxRetries}`);
          // Wait 500ms before retry
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        const correlationId =
          error instanceof DomainError ? error.correlationId : `corr-${Date.now()}`;
        this.transition("degraded", "retry_exhausted", correlationId);
        logInfo("Plugin handshake failed, continuing in degraded mode.");
        return {
          capabilities: [],
          availability: "degraded",
        };
      }
    }

    return {
      capabilities: [],
      availability: "degraded",
    };
  }

  getAvailability(): Availability {
    return this.availability;
  }

  getConfigDir(): string | null {
    return this.configDir;
  }

  getRuntimeStatus(): PluginRuntimeStatus {
    return {
      availability: this.availability,
      degradedReason: this.degradedReason,
      retryCount: this.retryCount,
      lastCorrelationId: this.lastCorrelationId,
    };
  }

  async send<TParams, TResult>(method: string, params?: TParams): Promise<TResult> {
    if (this.availability === "unavailable") {
      const error = new DomainError(
        "UNAVAILABLE",
        "Plugin is unavailable",
        this.lastCorrelationId ?? undefined,
      );
      this.transition("unavailable", "plugin_unavailable", error.correlationId);
      throw error;
    }

    const request: JsonRpcRequest<TParams> = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
      protocolVersion: PROTOCOL_VERSION,
    };

    try {
      const json = await this.postJson<TResult>(request);
      if (isJsonRpcFailure(json)) {
        this.transition("normal", null, null);
        throw new DomainError(
          json.error.code as never,
          json.error.message,
          json.error.data?.correlationId,
        );
      }

      this.transition("normal", null, null);
      return json.result;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      const correlationId =
        error instanceof DomainError ? error.correlationId : `corr-${Date.now()}`;
      this.transition("degraded", "plugin_unavailable", correlationId);
      throw new DomainError("UNAVAILABLE", "Plugin communication failed", correlationId);
    }
  }

  private async performHandshake(): Promise<HandshakeResult & { protocolVersion?: string }> {
    const request: JsonRpcRequest<unknown> = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "health.ping",
      protocolVersion: PROTOCOL_VERSION,
    };

    const json = await this.postJson<HandshakeResult>(request);
    if (isJsonRpcFailure(json)) {
      throw new Error(json.error.message);
    }

    return {
      ...json.result,
      protocolVersion: json.protocolVersion,
    };
  }

  private postJson<TResult>(request: JsonRpcRequest<unknown>): Promise<JsonRpcResponse<TResult>> {
    const url = new URL(this.pluginUrl);
    const transport = url.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(request);
      const httpRequest = transport.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP error! status: ${response.statusCode ?? "unknown"}`));
              return;
            }

            try {
              resolve(JSON.parse(rawBody) as JsonRpcResponse<TResult>);
            } catch (error) {
              reject(error instanceof Error ? error : new Error("Failed to parse plugin response"));
            }
          });
        },
      );

      httpRequest.on("error", (error) => {
        reject(error instanceof Error ? error : new Error("Plugin request failed"));
      });
      httpRequest.write(payload);
      httpRequest.end();
    });
  }

  private transition(
    availability: Availability,
    degradedReason: AvailabilityReason | null,
    correlationId: string | null,
  ): void {
    this.availability = availability;
    this.degradedReason = degradedReason;
    this.lastCorrelationId = correlationId;
  }
}
