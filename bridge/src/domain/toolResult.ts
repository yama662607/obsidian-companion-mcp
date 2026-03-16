import type { DomainError, DomainErrorCode } from "./errors";

export interface ToolTextContent {
    type: "text";
    text: string;
}

export interface ToolSuccess<TData> {
    content: ToolTextContent[];
    structuredContent: TData;
}

export interface ToolFailure {
    isError: true;
    code: DomainErrorCode;
    message: string;
    correlationId: string;
    content: ToolTextContent[];
    structuredContent: {
        code: DomainErrorCode;
        message: string;
        correlationId: string;
    };
}

type McpCompatibleResult = Record<string, unknown>;

export function okResult<TData>(
    summary: string,
    structuredContent: TData,
): ToolSuccess<TData> & McpCompatibleResult {
    return {
        content: [{ type: "text", text: summary }],
        structuredContent,
    };
}

export function errorResult(error: DomainError): ToolFailure & McpCompatibleResult {
    const payload = {
        isError: true,
        code: error.code,
        message: error.message,
        correlationId: error.correlationId,
    };

    return {
        isError: true,
        code: error.code,
        message: error.message,
        correlationId: error.correlationId,
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: {
            code: error.code,
            message: error.message,
            correlationId: error.correlationId,
        },
    };
}
