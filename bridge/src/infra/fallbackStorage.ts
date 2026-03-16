type NoteRecord = {
    content: string;
    metadata: Record<string, unknown>;
};

const notes = new Map<string, NoteRecord>();

function formatScalar(value: unknown): string {
    if (typeof value === "string") {
        return JSON.stringify(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (value === null || value === undefined) {
        return "null";
    }

    return JSON.stringify(value);
}

function renderFrontmatter(metadata: Record<string, unknown>): string {
    const entries = Object.entries(metadata);
    if (entries.length === 0) {
        return "";
    }

    const lines = entries.map(([key, value]) => `${key}: ${formatScalar(value)}`);
    return `---\n${lines.join("\n")}\n---\n`;
}

function stripFrontmatter(content: string): string {
    if (!content.startsWith("---\n")) {
        return content;
    }

    const end = content.indexOf("\n---\n", 4);
    if (end === -1) {
        return content;
    }

    return content.slice(end + 5);
}

function applyFrontmatter(content: string, metadata: Record<string, unknown>): string {
    const body = stripFrontmatter(content);
    const frontmatter = renderFrontmatter(metadata);
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
