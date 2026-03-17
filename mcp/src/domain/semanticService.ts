type IndexedNote = {
    path: string;
    snippet: string;
    updatedAt: number;
    embedding: number[];
};

import { createEmbeddingProvider, type EmbeddingProvider } from "./embeddingProvider";
import { IndexingQueue } from "./indexingQueue";

/**
 * Calculates cosine similarity between two vectors.
 * Since vectors from our provider are already normalized (length = 1),
 * cosine similarity is equal to the dot product.
 */
function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
        dotProduct += a[i] * b[i];
    }
    return dotProduct;
}

export class SemanticService {
    private notes = new Map<string, IndexedNote>();
    private queue = new IndexingQueue();
    private provider: EmbeddingProvider;

    constructor(preferRemote = false) {
        this.provider = createEmbeddingProvider(preferRemote);
    }

    queueIndex(path: string, snippet: string, updatedAt: number): boolean {
        return this.queue.enqueue({ path, content: snippet, updatedAt });
    }

    async flushIndex(maxItems = 25): Promise<number> {
        return this.queue.process(async (job) => {
            // Document embeddings use "passage: " prefix
            const embedding = await this.provider.embed(job.content, false);
            this.notes.set(job.path, {
                path: job.path,
                snippet: job.content,
                updatedAt: job.updatedAt,
                embedding,
            });
        }, maxItems);
    }

    upsert(path: string, snippet: string, updatedAt: number): boolean {
        const existing = this.notes.get(path);
        if (existing && existing.updatedAt >= updatedAt) {
            return false;
        }

        return this.queueIndex(path, snippet, updatedAt);
    }

    remove(path: string): void {
        this.notes.delete(path);
    }

    getIndexStatus(): { pendingCount: number; indexedCount: number; running: boolean; ready: boolean; isEmpty: boolean; modelReady: boolean } {
        const pendingCount = this.queue.getPendingCount();
        const indexedCount = this.notes.size;
        // In this context, modelReady means the provider can embed (local files exist or remote is active)
        // We can't easily make getIndexStatus async, so we'll rely on an internal flag or just let it be handled in search
        return {
            pendingCount,
            indexedCount,
            running: this.queue.isRunning(),
            ready: pendingCount === 0,
            isEmpty: indexedCount === 0,
            modelReady: !!(this.provider as any).extractor || this.provider.kind === "remote",
        };
    }

    async prepareModel(): Promise<void> {
        await this.provider.prepare();
    }

    async isModelReady(): Promise<boolean> {
        return this.provider.isReady();
    }

    async searchWithStatus(
        query: string,
        limit: number,
    ): Promise<{
        matches: Array<{ path: string; score: number; snippet: string }>;
        indexStatus: { pendingCount: number; indexedCount: number; running: boolean; ready: boolean; isEmpty: boolean; modelReady: boolean };
    }> {
        // Only flush if we have something to flush and we don't want to trigger auto-download here
        // But if the user explicitly calls search, they might expect some auto-indexing of pending items.
        // However, the user wants to separate "heavy" indexing.
        if (this.queue.getPendingCount() > 0) {
            await this.flushIndex(Math.max(limit * 2, 10));
        }
        
        const matches = await this.search(query, limit);
        return {
            matches,
            indexStatus: this.getIndexStatus(),
        };
    }

    /**
     * ACTUAL SEMANTIC SEARCH IMPLEMENTATION:
     * 1. Embed query with "query: " prefix.
     * 2. Calculate cosine similarity against all indexed notes.
     * 3. Sort by score and return top results.
     */
    async search(query: string, limit: number): Promise<Array<{ path: string; score: number; snippet: string }>> {
        if (this.notes.size === 0) return [];

        // Query embedding uses "query: " prefix
        const queryVector = await this.provider.embed(query, true);

        return Array.from(this.notes.values())
            .map((note) => {
                const score = cosineSimilarity(queryVector, note.embedding);
                return {
                    path: note.path,
                    snippet: note.snippet,
                    score,
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    getProvider(): EmbeddingProvider {
        return this.provider;
    }

    // For testing/internal use
    getNotes(): Map<string, IndexedNote> {
        return this.notes;
    }

    // Replace entire index (useful for loading from storage)
    setNotes(notes: Map<string, IndexedNote>): void {
        this.notes = notes;
    }
}
