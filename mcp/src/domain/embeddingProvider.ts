import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface EmbeddingProvider {
    embed(text: string, isQuery?: boolean): Promise<number[]>;
    prepare(): Promise<void>;
    isReady(): Promise<boolean>;
    kind: "local" | "remote";
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
    public readonly kind = "local" as const;
    private extractor: FeatureExtractionPipeline | null = null;
    private modelName = "Xenova/multilingual-e5-small";
    private modelDir: string;
    private vaultPath: string;
    private configDir: string;

    constructor(vaultPath: string, configDir: string) {
        this.vaultPath = vaultPath;
        this.configDir = configDir;
        this.modelDir = path.join(vaultPath, configDir, "plugins", "companion-mcp", "models");
        this.applyModelPath();
    }

    /**
     * Updates the model directory dynamically (called after plugin handshake).
     */
    public updateModelPath(vaultPath: string, configDir: string): void {
        this.vaultPath = vaultPath;
        this.configDir = configDir;
        this.modelDir = path.join(vaultPath, configDir, "plugins", "companion-mcp", "models");
        this.applyModelPath();
    }

    private applyModelPath(): void {
        // Ensure the directory exists
        if (!fs.existsSync(this.modelDir)) {
            fs.mkdirSync(this.modelDir, { recursive: true });
        }

        // Disable remote models by default to prevent unexpected downloads
        env.allowRemoteModels = false;
        env.localModelPath = this.modelDir;
        env.cacheDir = this.modelDir;
    }

    async isReady(): Promise<boolean> {
        // Check if the model files exist in the local directory
        // Transformers.js models are typically in a subdirectory matching the name
        const modelPath = path.join(this.modelDir, this.modelName);
        try {
            await fs.promises.access(modelPath);
            return true;
        } catch {
            return false;
        }
    }

    async prepare(): Promise<void> {
        if (this.extractor) return;

        try {
            // Temporarily allow remote models during explicit preparation/download
            env.allowRemoteModels = true;
            this.extractor = (await pipeline("feature-extraction", this.modelName)) as FeatureExtractionPipeline;
            env.allowRemoteModels = false;
        } catch (error) {
            env.allowRemoteModels = false;
            throw error;
        }
    }

    private async getExtractor(): Promise<FeatureExtractionPipeline> {
        if (!this.extractor) {
            // Try to load from local only
            try {
                this.extractor = (await pipeline("feature-extraction", this.modelName)) as FeatureExtractionPipeline;
            } catch (error) {
                throw new Error(`Model not found locally. Please run 'refresh_semantic_index' to download models. (Details: ${String(error)})`);
            }
        }
        return this.extractor;
    }

    /**
     * Generate embeddings using multilingual-e5-small.
     */
    async embed(text: string, isQuery = false): Promise<number[]> {
        const extractor = await this.getExtractor();
        const prefix = isQuery ? "query: " : "passage: ";
        const output = await extractor(`${prefix}${text}`, {
            pooling: "mean",
            normalize: true,
        });

        return Array.from(output.data as unknown as number[]);
    }
}

export class RemoteEmbeddingProvider implements EmbeddingProvider {
    public readonly kind = "remote" as const;

    async isReady(): Promise<boolean> {
        return true;
    }

    async prepare(): Promise<void> {
        // No-op for remote
    }

    embed(text: string, _isQuery = false): Promise<number[]> {
        const normalized = text.trim().toLowerCase();
        const score = normalized.length + 1;
        return Promise.resolve([score, score / 2, score / 4]);
    }
}

export function createEmbeddingProvider(
    preferRemote = false,
    vaultPath = "",
    configDir = ""
): EmbeddingProvider {
    if (preferRemote) {
        return new RemoteEmbeddingProvider();
    }
    // Use dummy paths if not provided yet (will be updated after plugin handshake)
    const effectiveVaultPath = vaultPath || "/tmp";
    const effectiveConfigDir = configDir || ".obsidian";
    return new LocalEmbeddingProvider(effectiveVaultPath, effectiveConfigDir);
}
