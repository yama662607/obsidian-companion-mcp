import * as fs from "node:fs";
import * as path from "node:path";
import { applyFrontmatter, hasFrontmatter, parseFrontmatter } from "../../../shared/frontmatter";
import { DomainError } from "../domain/errors";

type NoteRecord = {
  content: string;
  metadata: Record<string, unknown>;
};

export type ListedEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  updatedAt: number;
  size: number;
};

type ListEntriesOptions = {
  cursor?: string;
  limit?: number;
  recursive?: boolean;
  includeDirs?: boolean;
};

const VAULT_PATH_ENV = "OBSIDIAN_VAULT_PATH";

function getVaultRoot(): string {
  const configured = process.env[VAULT_PATH_ENV]?.trim();
  if (!configured) {
    throw new DomainError("UNAVAILABLE", `${VAULT_PATH_ENV} is required for note operations`);
  }

  return path.resolve(configured);
}

function normalizeVaultRelativePath(notePath: string, allowEmpty = false): string {
  if (!notePath) {
    if (allowEmpty) {
      return "";
    }
    throw new DomainError("VALIDATION", "path is required");
  }

  const normalized = path.posix.normalize(notePath.replaceAll("\\", "/"));
  if (allowEmpty && (normalized === "." || normalized === "")) {
    return "";
  }
  if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
    throw new DomainError("VALIDATION", `Invalid vault-relative path: ${notePath}`);
  }

  return normalized === "." ? "" : normalized;
}

function resolveVaultPath(notePath: string, allowEmpty = false): string {
  const normalized = normalizeVaultRelativePath(notePath, allowEmpty);
  const vaultRoot = getVaultRoot();
  const resolved = normalized ? path.resolve(vaultRoot, normalized) : vaultRoot;
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

function compareEntries(a: ListedEntry, b: ListedEntry): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.path.localeCompare(b.path, "en");
}

function encodeCursor(entry: ListedEntry): string {
  return Buffer.from(JSON.stringify({ path: entry.path, kind: entry.kind }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): { path: string; kind: "file" | "directory" } {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      path?: string;
      kind?: "file" | "directory";
    };
    if (!decoded.path || (decoded.kind !== "file" && decoded.kind !== "directory")) {
      throw new Error("invalid cursor");
    }
    return { path: decoded.path, kind: decoded.kind };
  } catch {
    throw new DomainError("VALIDATION", "Invalid list cursor");
  }
}

export function listEntries(
  dirPath: string,
  options: ListEntriesOptions = {},
): {
  entries: ListedEntry[];
  nextCursor: string | null;
  hasMore: boolean;
  truncated: boolean;
} {
  const rootPath = resolveVaultPath(dirPath, true);
  if (!fs.existsSync(rootPath)) {
    throw new DomainError("NOT_FOUND", `Directory not found: ${dirPath || "."}`);
  }

  const stats = fs.statSync(rootPath);
  if (!stats.isDirectory()) {
    throw new DomainError("VALIDATION", `Path is not a directory: ${dirPath || "."}`);
  }

  const recursive = options.recursive ?? false;
  const includeDirs = options.includeDirs ?? true;
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const vaultRoot = getVaultRoot();
  const results: ListedEntry[] = [];

  function scan(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const entryStats = fs.statSync(fullPath);
      const relativePath = path.relative(vaultRoot, fullPath).split(path.sep).join("/");

      if (entry.isDirectory()) {
        if (includeDirs) {
          results.push({
            path: relativePath,
            name: entry.name,
            kind: "directory",
            updatedAt: entryStats.mtimeMs,
            size: 0,
          });
        }
        if (recursive) {
          scan(fullPath);
        }
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      results.push({
        path: relativePath,
        name: entry.name,
        kind: "file",
        updatedAt: entryStats.mtimeMs,
        size: entryStats.size,
      });
    }
  }

  scan(rootPath);
  results.sort(compareEntries);

  let startIndex = 0;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    startIndex = results.findIndex(
      (entry) =>
        compareEntries(entry, {
          path: cursor.path,
          kind: cursor.kind,
          name: "",
          updatedAt: 0,
          size: 0,
        }) > 0,
    );
    if (startIndex === -1) {
      startIndex = results.length;
    }
  }

  const entries = results.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + entries.length < results.length;
  return {
    entries,
    nextCursor: hasMore && entries.length > 0 ? encodeCursor(entries[entries.length - 1]) : null,
    hasMore,
    truncated: hasMore,
  };
}

export function moveNote(fromPath: string, toPath: string): boolean {
  const sourcePath = resolveVaultPath(fromPath);
  const destinationPath = resolveVaultPath(toPath);

  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  if (fs.existsSync(destinationPath)) {
    throw new DomainError("CONFLICT", `Destination already exists: ${toPath}`);
  }

  const sourceStats = fs.statSync(sourcePath);
  if (!sourceStats.isFile()) {
    throw new DomainError("VALIDATION", `Path is not a note file: ${fromPath}`);
  }

  ensureParentDir(destinationPath);
  fs.renameSync(sourcePath, destinationPath);
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
