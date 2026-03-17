import fs from "node:fs";
import path from "node:path";
import { logInfo, logError } from "./logger";

type IndexedNote = {
    path: string;
    snippet: string;
    updatedAt: number;
    embedding: number[];
};

export class VectorStore {
    private readonly indexPath: string;

    constructor() {
        const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
        if (vaultPath) {
            // Standard Obsidian plugin data location
            this.indexPath = path.join(
                vaultPath,
                ".obsidian",
                "plugins",
                "companion-mcp",
                "data",
                "semantic-index.json"
            );
        } else {
            // Fallback to local project directory
            this.indexPath = path.join(process.cwd(), "semantic-index.json");
        }
    }

    async load(): Promise<Map<string, IndexedNote>> {
        try {
            if (!fs.existsSync(this.indexPath)) {
                return new Map();
            }

            const raw = fs.readFileSync(this.indexPath, "utf-8");
            const data = JSON.parse(raw) as Array<[string, IndexedNote]>;
            logInfo(`vector index loaded: ${data.length} notes from ${this.indexPath}`);
            return new Map(data);
        } catch (error) {
            logError(`failed to load vector index: ${error}`);
            return new Map();
        }
    }

    async save(notes: Map<string, IndexedNote>): Promise<void> {
        try {
            const dir = path.dirname(this.indexPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const data = Array.from(notes.entries());
            fs.writeFileSync(this.indexPath, JSON.stringify(data), "utf-8");
            logInfo(`vector index saved: ${notes.size} notes to ${this.indexPath}`);
        } catch (error) {
            logError(`failed to save vector index: ${error}`);
        }
    }

    getIndexPath(): string {
        return this.indexPath;
    }
}
