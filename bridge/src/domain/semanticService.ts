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
