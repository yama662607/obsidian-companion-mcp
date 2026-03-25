export const TOOL_TEXT_MAX_CHARS = 4_000;
export const RESPONSE_EXCERPT_MAX_CHARS = 500;
export const RESPONSE_ARRAY_MAX_ITEMS = 25;
export const RESPONSE_OBJECT_MAX_KEYS = 50;

export type TruncatedText = {
  text: string;
  truncated: boolean;
  totalChars: number;
};

export type BoundedStructuredValue = {
  value: unknown;
  truncated: boolean;
};

export function truncateText(text: string, maxChars: number): TruncatedText {
  if (text.length <= maxChars) {
    return { text, truncated: false, totalChars: text.length };
  }

  return {
    text: `${text.slice(0, Math.max(maxChars - 1, 0))}…`,
    truncated: true,
    totalChars: text.length,
  };
}

export function boundStructuredValue(
  value: unknown,
  {
    maxStringChars = RESPONSE_EXCERPT_MAX_CHARS,
    maxArrayItems = RESPONSE_ARRAY_MAX_ITEMS,
    maxObjectKeys = RESPONSE_OBJECT_MAX_KEYS,
  }: {
    maxStringChars?: number;
    maxArrayItems?: number;
    maxObjectKeys?: number;
  } = {},
): BoundedStructuredValue {
  if (typeof value === "string") {
    const truncated = truncateText(value, maxStringChars);
    return { value: truncated.text, truncated: truncated.truncated };
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return { value, truncated: false };
  }

  if (typeof value === "bigint") {
    return { value: value.toString(), truncated: false };
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, maxArrayItems);
    let truncated = value.length > items.length;
    const boundedItems = items.map((item) => {
      const bounded = boundStructuredValue(item, {
        maxStringChars,
        maxArrayItems,
        maxObjectKeys,
      });
      if (bounded.truncated) {
        truncated = true;
      }
      return bounded.value;
    });
    return { value: boundedItems, truncated };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    const limitedEntries = entries.slice(0, maxObjectKeys);
    let truncated = entries.length > limitedEntries.length;
    const boundedObject = Object.fromEntries(
      limitedEntries.map(([key, nestedValue]) => {
        const bounded = boundStructuredValue(nestedValue, {
          maxStringChars,
          maxArrayItems,
          maxObjectKeys,
        });
        if (bounded.truncated) {
          truncated = true;
        }
        return [key, bounded.value];
      }),
    );
    return { value: boundedObject, truncated };
  }

  return { value: null, truncated: true };
}
