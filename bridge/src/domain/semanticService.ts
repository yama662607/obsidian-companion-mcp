type IndexedNote = {
    path: string;
    snippet: string;
    updatedAt: number;
    embedding: number[];
};

import { createEmbeddingProvider, type EmbeddingProvider } from "./embeddingProvider";
import { IndexingQueue } from "./indexingQueue";

export class SemanticService {
    private notes = new Map<string, IndexedNote>();
    private queue = new IndexingQueue();
    private provider: EmbeddingProvider;

    constructor(preferRemote = false) {
        this.provider = createEmbeddingProvider(preferRemote);
    }

    queueIndex(path: string, snippet: string, updatedAt: number): void {
        this.queue.enqueue({ path, content: snippet, updatedAt });
    }

    async flushIndex(maxItems = 25): Promise<number> {
        return this.queue.process(async (job) => {
            const embedding = await this.provider.embed(job.content);
            this.notes.set(job.path, {
                path: job.path,
                snippet: job.content,
                updatedAt: job.updatedAt,
                embedding,
            });
        }, maxItems);
    }

    upsert(path: string, snippet: string, updatedAt: number): void {
        this.queueIndex(path, snippet, updatedAt);
    }

    remove(path: string): void {
        this.notes.delete(path);
    }

    getIndexStatus(): { pendingCount: number; indexedCount: number; running: boolean; ready: boolean; isEmpty: boolean } {
        const pendingCount = this.queue.getPendingCount();
        const indexedCount = this.notes.size;
        return {
            pendingCount,
            indexedCount,
            running: this.queue.isRunning(),
            ready: pendingCount === 0,
            isEmpty: indexedCount === 0,
        };
    }

    async searchWithStatus(
        query: string,
        limit: number,
    ): Promise<{
        matches: Array<{ path: string; score: number; snippet: string }>;
        indexStatus: { pendingCount: number; indexedCount: number; running: boolean; ready: boolean; isEmpty: boolean };
    }> {
        await this.flushIndex(Math.max(limit * 2, 10));
        return {
            matches: this.search(query, limit),
            indexStatus: this.getIndexStatus(),
        };
    }

    search(query: string, limit: number): Array<{ path: string; score: number; snippet: string }> {
        const q = query.toLowerCase();
        return Array.from(this.notes.values())
            .map((note) => ({
                path: note.path,
                snippet: note.snippet,
                score: note.snippet.toLowerCase().includes(q) ? 0.9 : 0.2,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
}
