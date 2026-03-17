import * as fs from "node:fs";
import * as path from "node:path";
import { DomainError } from "../domain/errors";

type NoteRecord = {
    content: string;
    metadata: Record<string, unknown>;
};

const VAULT_PATH_ENV = "OBSIDIAN_VAULT_PATH";

function detectEol(content: string): "\n" | "\r\n" {
    return content.includes("\r\n") ? "\r\n" : "\n";
}

function quoteYamlString(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

function formatScalar(value: unknown): string {
    if (typeof value === "string") {
        const safePlain =
            value.length > 0 &&
            !value.includes("\n") &&
            !value.includes("\r") &&
            !value.includes(":") &&
            !value.includes("#") &&
            !value.startsWith(" ") &&
            !value.endsWith(" ");

        return safePlain ? value : quoteYamlString(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (value === null || value === undefined) {
        return "null";
    }

    return JSON.stringify(value);
}

function renderFrontmatter(metadata: Record<string, unknown>, eol: "\n" | "\r\n"): string {
    const entries = Object.entries(metadata);
    if (entries.length === 0) {
        return "";
    }

    const lines = entries.map(([key, value]) => `${key}: ${formatScalar(value)}`);
    return `---${eol}${lines.join(eol)}${eol}---${eol}`;
}

function stripFrontmatter(content: string): string {
    const frontmatterPattern = /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/;
    const matched = content.match(frontmatterPattern);
    if (!matched) {
        return content;
    }

    return content.slice(matched[0].length);
}

function parseFrontmatter(content: string): Record<string, unknown> {
    const frontmatterPattern = /^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/;
    const matched = content.match(frontmatterPattern);
    if (!matched) {
        return {};
    }

    const metadata: Record<string, unknown> = {};
    for (const line of matched[1].split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes(":")) {
            continue;
        }

        const separator = trimmed.indexOf(":");
        const key = trimmed.slice(0, separator).trim();
        let rawValue = trimmed.slice(separator + 1).trim();
        if (!key) {
            continue;
        }

        if ((rawValue.startsWith("'") && rawValue.endsWith("'")) || (rawValue.startsWith('"') && rawValue.endsWith('"'))) {
            rawValue = rawValue.slice(1, -1);
        }

        if (rawValue === "null") {
            metadata[key] = null;
        } else if (rawValue === "true" || rawValue === "false") {
            metadata[key] = rawValue === "true";
        } else if (!Number.isNaN(Number(rawValue)) && rawValue !== "") {
            metadata[key] = Number(rawValue);
        } else {
            metadata[key] = rawValue;
        }
    }

    return metadata;
}

function applyFrontmatter(content: string, metadata: Record<string, unknown>): string {
    const eol = detectEol(content);
    const body = stripFrontmatter(content);
    const frontmatter = renderFrontmatter(metadata, eol);
    return frontmatter ? `${frontmatter}${body}` : body;
}

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
    const metadata = existing?.metadata ?? {};
    const next = {
        content: applyFrontmatter(content, metadata),
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
