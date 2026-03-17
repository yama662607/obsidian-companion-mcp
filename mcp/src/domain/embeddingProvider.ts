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
        const configDir = process.env.OBSIDIAN_CONFIG_DIR || ".obsidian";
        let modelDir: string;

        if (vaultPath) {
            // Store models inside the Obsidian vault plugin data directory
            // Use configDir (e.g. .obsidian) to be compatible with user settings
            modelDir = path.join(
                vaultPath,
                configDir,
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
            this.extractor = (await pipeline("feature-extraction", this.modelName)) as FeatureExtractionPipeline;
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

        // The output data is a Float32Array, convert it to a regular array
        return Array.from(output.data as unknown as number[]);
    }
}

export class RemoteEmbeddingProvider implements EmbeddingProvider {
    public readonly kind = "remote" as const;

    /**
     * Mock implementation for remote provider. 
     * Removed 'async' if not using 'await', or use Promise.resolve.
     */
    embed(text: string, _isQuery = false): Promise<number[]> {
        const normalized = text.trim().toLowerCase();
        const score = normalized.length + 1;
        return Promise.resolve([score, score / 2, score / 4]);
    }
}

export function createEmbeddingProvider(preferRemote = false): EmbeddingProvider {
    return preferRemote ? new RemoteEmbeddingProvider() : new LocalEmbeddingProvider();
}
