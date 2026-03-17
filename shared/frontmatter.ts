export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[];

export function detectEol(content: string): "\n" | "\r\n" {
    return content.includes("\r\n") ? "\r\n" : "\n";
}

function quoteYamlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function parseQuotedString(rawValue: string): string {
    if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
        return rawValue.slice(1, -1).replaceAll("''", "'");
    }

    if (rawValue.startsWith("\"") && rawValue.endsWith("\"")) {
        try {
            return JSON.parse(rawValue);
        } catch {
            return rawValue.slice(1, -1);
        }
    }

    return rawValue;
}

function parseScalar(rawValue: string): FrontmatterValue {
    const normalized = rawValue.trim();
    if (normalized === "null") {
        return null;
    }

    if (normalized === "true" || normalized === "false") {
        return normalized === "true";
    }

    if (
        (normalized.startsWith("'") && normalized.endsWith("'")) ||
        (normalized.startsWith("\"") && normalized.endsWith("\""))
    ) {
        return parseQuotedString(normalized);
    }

    if (normalized.startsWith("[") && normalized.endsWith("]")) {
        try {
            const parsed = JSON.parse(normalized);
            if (Array.isArray(parsed)) {
                return parsed as FrontmatterValue[];
            }
        } catch {
            // Fall through and treat as string.
        }
    }

    if (normalized !== "" && !Number.isNaN(Number(normalized))) {
        return Number(normalized);
    }

    return normalized;
}

function formatScalar(value: Exclude<FrontmatterValue, FrontmatterValue[]>): string {
    if (typeof value === "string") {
        const safePlain =
            value.length > 0 &&
            !value.includes("\n") &&
            !value.includes("\r") &&
            !value.includes(":") &&
            !value.includes("#") &&
            !value.startsWith(" ") &&
            !value.endsWith(" ") &&
            value !== "null" &&
            value !== "true" &&
            value !== "false";

        return safePlain ? value : quoteYamlString(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return "null";
}

function renderArrayItem(value: FrontmatterValue): string {
    if (Array.isArray(value)) {
        return quoteYamlString(JSON.stringify(value));
    }

    return formatScalar(value);
}

function renderEntry(key: string, value: FrontmatterValue, eol: "\n" | "\r\n"): string {
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return `${key}: []`;
        }

        return `${key}:${eol}${value.map((item) => `  - ${renderArrayItem(item)}`).join(eol)}`;
    }

    return `${key}: ${formatScalar(value)}`;
}

export function renderFrontmatter(metadata: Record<string, unknown>, eol: "\n" | "\r\n"): string {
    const entries = Object.entries(metadata);
    if (entries.length === 0) {
        return "";
    }

    const lines = entries.map(([key, value]) => renderEntry(key, value as FrontmatterValue, eol));
    return `---${eol}${lines.join(eol)}${eol}---${eol}`;
}

export function stripFrontmatter(content: string): string {
    const frontmatterPattern = /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/;
    const matched = content.match(frontmatterPattern);
    if (!matched) {
        return content;
    }

    return content.slice(matched[0].length);
}

export function parseFrontmatter(content: string): Record<string, unknown> {
    const frontmatterPattern = /^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/;
    const matched = content.match(frontmatterPattern);
    if (!matched) {
        return {};
    }

    const metadata: Record<string, unknown> = {};
    const lines = matched[1].split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
            continue;
        }

        const separator = rawLine.indexOf(":");
        if (separator <= 0) {
            continue;
        }

        const key = rawLine.slice(0, separator).trim();
        const rawValue = rawLine.slice(separator + 1).trim();
        if (!key) {
            continue;
        }

        if (rawValue === "") {
            const items: FrontmatterValue[] = [];
            let cursor = i + 1;
            while (cursor < lines.length) {
                const itemLine = lines[cursor];
                const itemMatch = itemLine.match(/^\s*-\s+(.*)$/);
                if (!itemMatch) {
                    break;
                }

                items.push(parseScalar(itemMatch[1]));
                cursor++;
            }

            if (items.length > 0) {
                metadata[key] = items;
                i = cursor - 1;
                continue;
            }
        }

        metadata[key] = parseScalar(rawValue);
    }

    return metadata;
}

export function hasFrontmatter(content: string): boolean {
    return /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/.test(content);
}

export function applyFrontmatter(content: string, metadata: Record<string, unknown>): string {
    const eol = detectEol(content);
    const body = stripFrontmatter(content);
    const frontmatter = renderFrontmatter(metadata, eol);
    return frontmatter ? `${frontmatter}${body}` : body;
}
