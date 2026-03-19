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

function buildStructuredPreview(structuredContent: unknown): string | null {
  if (structuredContent === null || structuredContent === undefined) {
    return null;
  }

  switch (typeof structuredContent) {
    case "string":
      return structuredContent;
    case "number":
    case "boolean":
      return JSON.stringify(structuredContent);
    case "bigint":
      return structuredContent.toString();
    case "function":
    case "symbol":
      return null;
    default:
      break;
  }

  const serialized = JSON.stringify(
    structuredContent,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  if (!serialized) {
    return null;
  }

  const maxChars = 4_000;
  if (serialized.length <= maxChars) {
    return serialized;
  }

  return `${serialized.slice(0, maxChars)}\n…`;
}

export function okResult<TData>(
  summary: string,
  structuredContent: TData,
  detailText?: string,
): ToolSuccess<TData> & McpCompatibleResult {
  const preview = detailText ?? buildStructuredPreview(structuredContent);
  const text = preview ? `${summary}\n\n${preview}` : summary;

  return {
    content: [{ type: "text", text }],
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
