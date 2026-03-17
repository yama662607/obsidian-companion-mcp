export interface EmbeddingProvider {
    embed(text: string): Promise<number[]>;
    kind: "local" | "remote";
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
    public readonly kind = "local" as const;

    async embed(text: string): Promise<number[]> {
        const normalized = text.trim().toLowerCase();
        const score = normalized.length;
        return [score, score / 2, score / 3];
    }
}

export class RemoteEmbeddingProvider implements EmbeddingProvider {
    public readonly kind = "remote" as const;

    async embed(text: string): Promise<number[]> {
        const normalized = text.trim().toLowerCase();
        const score = normalized.length + 1;
        return [score, score / 2, score / 4];
    }
}

export function createEmbeddingProvider(preferRemote = false): EmbeddingProvider {
    return preferRemote ? new RemoteEmbeddingProvider() : new LocalEmbeddingProvider();
}
