import * as fs from "node:fs";
import * as path from "node:path";
import { DomainError } from "../domain/errors";
import { applyFrontmatter, hasFrontmatter, parseFrontmatter } from "../../../shared/frontmatter";

type NoteRecord = {
    content: string;
    metadata: Record<string, unknown>;
};

const VAULT_PATH_ENV = "OBSIDIAN_VAULT_PATH";

function getVaultRoot(): string {
    const configured = process.env[VAULT_PATH_ENV]?.trim();
    if (!configured) {
        throw new DomainError("UNAVAILABLE", `${VAULT_PATH_ENV} is required for note operations`);
    }

    return path.resolve(configured);
}

function resolveVaultPath(notePath: string): string {
    if (!notePath) {
        throw new DomainError("VALIDATION", "path is required");
    }

    const normalized = path.posix.normalize(notePath.replaceAll("\\", "/"));
    if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
        throw new DomainError("VALIDATION", `Invalid vault-relative path: ${notePath}`);
    }

    const vaultRoot = getVaultRoot();
    const resolved = path.resolve(vaultRoot, normalized);
    const relative = path.relative(vaultRoot, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new DomainError("VALIDATION", `Path escapes vault root: ${notePath}`);
    }

    return resolved;
}

function ensureParentDir(filePath: string): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
}

export function readNote(path: string): NoteRecord | undefined {
    const filePath = resolveVaultPath(path);
    if (!fs.existsSync(filePath)) {
        return undefined;
    }

    const content = fs.readFileSync(filePath, "utf8");
    return {
        content,
        metadata: parseFrontmatter(content),
    };
}

export function writeNote(path: string, content: string): NoteRecord {
    const filePath = resolveVaultPath(path);
    const existing = readNote(path);
    const metadata = hasFrontmatter(content) ? parseFrontmatter(content) : (existing?.metadata ?? {});
    const next = {
        content: hasFrontmatter(content) ? content : applyFrontmatter(content, metadata),
        metadata,
    };
    ensureParentDir(filePath);
    fs.writeFileSync(filePath, next.content, "utf8");
    return next;
}

export function updateMetadata(path: string, metadata: Record<string, unknown>): NoteRecord {
    const filePath = resolveVaultPath(path);
    const existing = readNote(path) ?? { content: "", metadata: {} };
    const mergedMetadata = { ...existing.metadata, ...metadata };
    const next = {
        content: applyFrontmatter(existing.content, mergedMetadata),
        metadata: mergedMetadata,
    };
    ensureParentDir(filePath);
    fs.writeFileSync(filePath, next.content, "utf8");
    return next;
}

export function deleteNote(path: string): boolean {
    const filePath = resolveVaultPath(path);
    if (!fs.existsSync(filePath)) {
        return false;
    }
    fs.rmSync(filePath);
    return true;
}

export function listNotes(): { path: string; updatedAt: number; content: string }[] {
    const vaultRoot = getVaultRoot();
    const results: { path: string; updatedAt: number; content: string }[] = [];

    function scan(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(vaultRoot, fullPath);

            // Skip hidden directories (like .obsidian, .git)
            if (entry.isDirectory()) {
                if (entry.name.startsWith(".")) {
                    continue;
                }
                scan(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".md")) {
                const stats = fs.statSync(fullPath);
                const content = fs.readFileSync(fullPath, "utf8");
                results.push({
                    path: relativePath,
                    updatedAt: stats.mtimeMs,
                    content,
                });
            }
        }
    }

    if (fs.existsSync(vaultRoot)) {
        scan(vaultRoot);
    }

    return results;
}
