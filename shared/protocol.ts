export const PROTOCOL_VERSION = "1.0.0";

export type JsonRpcId = string | number;

export interface JsonRpcRequest<TParams = unknown> {
    jsonrpc: "2.0";
    id: JsonRpcId;
    method: string;
    params?: TParams;
    protocolVersion: string;
}

export interface JsonRpcSuccess<TResult = unknown> {
    jsonrpc: "2.0";
    id: JsonRpcId;
    protocolVersion: string;
    result: TResult;
}

export interface JsonRpcErrorData {
    correlationId: string;
    details?: Record<string, unknown>;
}

export interface JsonRpcError {
    code: string;
    message: string;
    data: JsonRpcErrorData;
}

export interface JsonRpcFailure {
    jsonrpc: "2.0";
    id: JsonRpcId;
    error: JsonRpcError;
}

export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccess<TResult> | JsonRpcFailure;

export interface HandshakeResult {
    capabilities: string[];
    availability: "normal" | "degraded" | "unavailable";
}

export function isJsonRpcFailure(input: JsonRpcResponse<unknown>): input is JsonRpcFailure {
    return (input as JsonRpcFailure).error !== undefined;
}
