type NoteRecord = {
    content: string;
    metadata: Record<string, unknown>;
};

const notes = new Map<string, NoteRecord>();

export function readNote(path: string): NoteRecord | undefined {
    return notes.get(path);
}

export function writeNote(path: string, content: string): NoteRecord {
    const existing = notes.get(path);
    const next = {
        content,
        metadata: existing?.metadata ?? {},
    };
    notes.set(path, next);
    return next;
}

export function updateMetadata(path: string, metadata: Record<string, unknown>): NoteRecord {
    const existing = notes.get(path) ?? { content: "", metadata: {} };
    const next = {
        content: existing.content,
        metadata: { ...existing.metadata, ...metadata },
    };
    notes.set(path, next);
    return next;
}

export function deleteNote(path: string): boolean {
    return notes.delete(path);
}
