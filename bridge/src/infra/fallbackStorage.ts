type NoteRecord = {
    content: string;
    metadata: Record<string, unknown>;
};

const notes = new Map<string, NoteRecord>();

function detectEol(content: string): "\n" | "\r\n" {
    return content.includes("\r\n") ? "\r\n" : "\n";
}

function quoteYamlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function formatScalar(value: unknown): string {
    if (typeof value === "string") {
        const safePlain =
            value.length > 0 &&
            !value.includes("\n") &&
            !value.includes("\r") &&
            !value.includes(":") &&
            !value.includes("#") &&
            !value.startsWith(" ") &&
            !value.endsWith(" ");

        return safePlain ? value : quoteYamlString(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (value === null || value === undefined) {
        return "null";
    }

    return JSON.stringify(value);
}

function renderFrontmatter(metadata: Record<string, unknown>, eol: "\n" | "\r\n"): string {
    const entries = Object.entries(metadata);
    if (entries.length === 0) {
        return "";
    }

    const lines = entries.map(([key, value]) => `${key}: ${formatScalar(value)}`);
    return `---${eol}${lines.join(eol)}${eol}---${eol}`;
}

function stripFrontmatter(content: string): string {
    const frontmatterPattern = /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/;
    const matched = content.match(frontmatterPattern);
    if (!matched) {
        return content;
    }

    return content.slice(matched[0].length);
}

function applyFrontmatter(content: string, metadata: Record<string, unknown>): string {
    const eol = detectEol(content);
    const body = stripFrontmatter(content);
    const frontmatter = renderFrontmatter(metadata, eol);
    return frontmatter ? `${frontmatter}${body}` : body;
}

export function readNote(path: string): NoteRecord | undefined {
    return notes.get(path);
}

export function writeNote(path: string, content: string): NoteRecord {
    const existing = notes.get(path);
    const metadata = existing?.metadata ?? {};
    const next = {
        content: applyFrontmatter(content, metadata),
        metadata,
    };
    notes.set(path, next);
    return next;
}

export function updateMetadata(path: string, metadata: Record<string, unknown>): NoteRecord {
    const existing = notes.get(path) ?? { content: "", metadata: {} };
    const mergedMetadata = { ...existing.metadata, ...metadata };
    const next = {
        content: applyFrontmatter(existing.content, mergedMetadata),
        metadata: mergedMetadata,
    };
    notes.set(path, next);
    return next;
}

export function deleteNote(path: string): boolean {
    return notes.delete(path);
}
