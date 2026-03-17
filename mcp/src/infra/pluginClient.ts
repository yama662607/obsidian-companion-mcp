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
    | "protocol_mismatch"
    | "retry_exhausted"
    | "plugin_unavailable";

export interface PluginRuntimeStatus {
    availability: Availability;
    degradedReason: AvailabilityReason | null;
    retryCount: number;
    lastCorrelationId: string | null;
}

type HandshakeResultWithVersion = HandshakeResult & { protocolVersion?: string };

export class PluginClient {
    private availability: Availability = "unavailable";
    private degradedReason: AvailabilityReason | null = "startup_not_attempted";
    private lastCorrelationId: string | null = null;
    private retryCount = 0;

    constructor(
        private readonly maxRetries = 3,
        private readonly expectedProtocolVersion = PROTOCOL_VERSION,
    ) { }

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

                this.transition("normal", null, null);
                logInfo(`plugin connected on attempt ${attempt}/${this.maxRetries}`);
                return result;
            } catch (error) {
                if (error instanceof DomainError && error.code === "CONFLICT") {
                    throw error;
                }

                if (attempt < this.maxRetries) {
                    logInfo(`plugin handshake retry ${attempt}/${this.maxRetries}`);
                    continue;
                }

                const correlationId = error instanceof DomainError ? error.correlationId : `corr-${Date.now()}`;
                this.transition("degraded", "retry_exhausted", correlationId);
                throw new DomainError("UNAVAILABLE", "Plugin connection retries exceeded", correlationId);
            }
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

    private mockResponse<TResult>(request: JsonRpcRequest<unknown>): Promise<JsonRpcResponse<TResult>> {
        return Promise.resolve({
            jsonrpc: "2.0",
            id: request.id,
            protocolVersion: PROTOCOL_VERSION,
            result: {} as TResult,
        });
    }

    private performHandshake(): Promise<HandshakeResultWithVersion> {
        return Promise.resolve({
            capabilities: [
                "semantic.search",
                "editor.getContext",
                "editor.applyCommand",
                "notes.read",
                "notes.write",
                "metadata.update",
            ],
            availability: "normal",
            protocolVersion: PROTOCOL_VERSION,
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
