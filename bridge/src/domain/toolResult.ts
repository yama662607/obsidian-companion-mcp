import type { DomainError } from "./errors";

export interface ToolTextContent {
    type: "text";
    text: string;
}

export interface ToolSuccess<TData> {
    [key: string]: unknown;
    content: ToolTextContent[];
    structuredContent: TData;
}

export interface ToolFailure {
    [key: string]: unknown;
    isError: true;
    content: ToolTextContent[];
    structuredContent: {
        code: string;
        correlationId: string;
    };
}

export function okResult<TData>(summary: string, structuredContent: TData): ToolSuccess<TData> {
    return {
        content: [{ type: "text", text: summary }],
        structuredContent,
    };
}

export function errorResult(error: DomainError): ToolFailure {
    return {
        isError: true,
        content: [{ type: "text", text: error.message }],
        structuredContent: {
            code: error.code,
            correlationId: error.correlationId,
        },
    };
}
