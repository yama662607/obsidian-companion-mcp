import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface EmbeddingProvider {
    embed(text: string, isQuery?: boolean): Promise<number[]>;
    kind: "local" | "remote";
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
    public readonly kind = "local" as const;
    private extractor: FeatureExtractionPipeline | null = null;
    private modelName = "Xenova/multilingual-e5-small";

    constructor() {
        const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
        let modelDir: string;

        if (vaultPath) {
            // Store models inside the Obsidian vault plugin data directory
            modelDir = path.join(
                vaultPath,
                ".obsidian",
                "plugins",
                "companion-mcp",
                "models"
            );
        } else {
            // Fallback to user's home directory cache
            modelDir = path.join(os.homedir(), ".cache", "obsidian-companion-mcp", "models");
        }

        // Ensure the directory exists
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        env.allowRemoteModels = true;
        env.localModelPath = modelDir;
        // Use the cache directory as the base for all model loading
        env.cacheDir = modelDir;
    }

    private async getExtractor(): Promise<FeatureExtractionPipeline> {
        if (!this.extractor) {
            this.extractor = await pipeline("feature-extraction", this.modelName);
        }
        return this.extractor;
    }

    /**
     * Generate embeddings using multilingual-e5-small.
     * E5 models require "query: " or "passage: " prefix for optimal performance.
     */
    async embed(text: string, isQuery = false): Promise<number[]> {
        const extractor = await this.getExtractor();
        const prefix = isQuery ? "query: " : "passage: ";
        const output = await extractor(`${prefix}${text}`, {
            pooling: "mean",
            normalize: true,
        });

        return Array.from(output.data);
    }
}

export class RemoteEmbeddingProvider implements EmbeddingProvider {
    public readonly kind = "remote" as const;

    async embed(text: string, isQuery = false): Promise<number[]> {
        // Fallback or future OpenAI implementation
        const normalized = text.trim().toLowerCase();
        const score = normalized.length + 1;
        return [score, score / 2, score / 4];
    }
}

export function createEmbeddingProvider(preferRemote = false): EmbeddingProvider {
    return preferRemote ? new RemoteEmbeddingProvider() : new LocalEmbeddingProvider();
}
