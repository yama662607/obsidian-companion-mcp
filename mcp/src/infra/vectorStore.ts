import { promises as fs } from "node:fs";
import path from "node:path";
import { logInfo, logError } from "./logger";

type IndexedNote = {
    path: string;
    snippet: string;
    updatedAt: number;
    embedding: number[];
};

export class VectorStore {
    private indexPath: string;

    constructor() {
        const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
        const configDir = process.env.OBSIDIAN_CONFIG_DIR || ".obsidian";

        this.indexPath = vaultPath
            ? path.join(vaultPath, configDir, "plugins", "companion-mcp", "data", "semantic-index.json")
            : path.join(process.cwd(), "semantic-index.json");
    }

    /**
     * Updates the index path dynamically.
     */
    public updateIndexPath(vaultPath: string, configDir: string): void {
        this.indexPath = path.join(vaultPath, configDir, "plugins", "companion-mcp", "data", "semantic-index.json");
    }

    async load(): Promise<Map<string, IndexedNote>> {
        try {
            // Check existence asynchronously
            try {
                await fs.access(this.indexPath);
            } catch {
                return new Map();
            }

            const raw = await fs.readFile(this.indexPath, "utf-8");
            const data = JSON.parse(raw) as Array<[string, IndexedNote]>;
            logInfo(`vector index loaded: ${data.length} notes from ${this.indexPath}`);
            return new Map(data);
        } catch (error) {
            logError(`failed to load vector index: ${String(error)}`);
            return new Map();
        }
    }

    async save(notes: Map<string, IndexedNote>): Promise<void> {
        try {
            const dir = path.dirname(this.indexPath);
            // Create directory asynchronously
            await fs.mkdir(dir, { recursive: true });

            const data = Array.from(notes.entries());
            await fs.writeFile(this.indexPath, JSON.stringify(data), "utf-8");
            logInfo(`vector index saved: ${notes.size} notes to ${this.indexPath}`);
        } catch (error) {
            logError(`failed to save vector index: ${String(error)}`);
        }
    }

    getIndexPath(): string {
        return this.indexPath;
    }
}
