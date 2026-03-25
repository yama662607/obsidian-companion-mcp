import type { DomainError, DomainErrorCode } from "./errors";
import { TOOL_TEXT_MAX_CHARS, truncateText } from "./responseBounds";

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

function humanizeValidationMessage(message: string): string {
  if (
    message.includes("must be equal to constant") ||
    message.includes("Invalid discriminator value")
  ) {
    return `${message} Supported edit change.type values are replaceTarget, append, prepend, insertAtCursor, and replaceText.`;
  }

  if (message.includes("occurrence")) {
    return `${message} Use "first", "last", "all", or a positive number such as 1.`;
  }

  if (message.includes("must be an object or a JSON string representing one")) {
    return `${message} Pass the structured target/change object returned by read_note or read_active_context.`;
  }

  return message;
}

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

  return truncateText(serialized, TOOL_TEXT_MAX_CHARS).text;
}

export function okResult<TData>(
  summary: string,
  structuredContent: TData,
  detailText?: string,
): ToolSuccess<TData> & McpCompatibleResult {
  const preview = detailText ?? buildStructuredPreview(structuredContent);
  const text = truncateText(
    preview ? `${summary}\n\n${preview}` : summary,
    TOOL_TEXT_MAX_CHARS,
  ).text;

  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

export function errorResult(error: DomainError): ToolFailure & McpCompatibleResult {
  const message =
    error.code === "VALIDATION" ? humanizeValidationMessage(error.message) : error.message;
  const payload = {
    isError: true,
    code: error.code,
    message,
    correlationId: error.correlationId,
  };

  return {
    isError: true,
    code: error.code,
    message,
    correlationId: error.correlationId,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: {
      code: error.code,
      message,
      correlationId: error.correlationId,
    },
  };
}
