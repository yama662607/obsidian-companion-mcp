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

export type AvailabilityReason =
    | "startup_not_attempted"
    | "missing_api_key"
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

    constructor(
        private readonly maxRetries = 3,
        private readonly expectedProtocolVersion = PROTOCOL_VERSION,
    ) { }

    async connect(apiKey: string): Promise<HandshakeResult> {
        this.retryCount = 0;

        if (!apiKey) {
            const error = new DomainError("AUTH", "API key is required to connect plugin");
            this.transition("unavailable", "missing_api_key", error.correlationId);
            throw error;
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
            if (PROTOCOL_VERSION !== this.expectedProtocolVersion) {
                const error = new DomainError("CONFLICT", "Protocol version mismatch");
                this.transition("degraded", "protocol_mismatch", error.correlationId);
                throw error;
            }
            this.transition("normal", null, null);
            logInfo(`plugin connected on retry ${this.retryCount}`);
            return result;
        }

        const error = new DomainError("UNAVAILABLE", "Plugin connection retries exceeded");
        this.transition("degraded", "retry_exhausted", error.correlationId);
        throw error;
    }

    getAvailability(): Availability {
        return this.availability;
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
            const error = new DomainError("UNAVAILABLE", "Plugin is unavailable", this.lastCorrelationId ?? undefined);
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
