#!/usr/bin/env node

// src/infra/logger.ts
function logInfo(message) {
  console.error(`[mcp] ${message}`);
}
function logError(message) {
  console.error(`[mcp:error] ${message}`);
}

// src/server.ts
import fs5 from "fs";
import path6 from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ../shared/editorPositions.ts
function getEditorLines(content) {
  return content.split("\n");
}
function compareEditorPositions(a, b) {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.ch - b.ch;
}
function validateEditorPosition(content, position, label = "Position") {
  if (position.line < 0 || position.ch < 0) {
    return `${label} must be non-negative`;
  }
  const lines = getEditorLines(content);
  if (position.line >= lines.length) {
    return `${label} line ${position.line} exceeds content line count ${lines.length}`;
  }
  const lineLength = lines[position.line]?.length ?? 0;
  if (position.ch > lineLength) {
    return `${label} ch ${position.ch} exceeds line length ${lineLength} at line ${position.line}`;
  }
  return null;
}
function validateEditorRange(content, range) {
  const fromError = validateEditorPosition(content, range.from, "Range start");
  if (fromError) {
    return fromError;
  }
  const toError = validateEditorPosition(content, range.to, "Range end");
  if (toError) {
    return toError;
  }
  if (compareEditorPositions(range.from, range.to) > 0) {
    return "Range start must not be after range end";
  }
  return null;
}
function editorPositionToOffset(content, position) {
  const lines = getEditorLines(content);
  let offset = 0;
  for (let index = 0; index < position.line; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }
  return offset + position.ch;
}
function sliceEditorRange(content, range) {
  const validationError = validateEditorRange(content, range);
  if (validationError) {
    throw new Error(validationError);
  }
  const start = editorPositionToOffset(content, range.from);
  const end = editorPositionToOffset(content, range.to);
  return content.slice(start, end);
}
function replaceEditorRangeContent(content, range, replacement) {
  const validationError = validateEditorRange(content, range);
  if (validationError) {
    throw new Error(validationError);
  }
  const start = editorPositionToOffset(content, range.from);
  const end = editorPositionToOffset(content, range.to);
  return `${content.slice(0, start)}${replacement}${content.slice(end)}`;
}

// src/domain/errors.ts
var DomainError = class extends Error {
  code;
  correlationId;
  constructor(code, message, correlationId) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.correlationId = correlationId ?? `corr-${Date.now()}`;
  }
};

// src/domain/editorService.ts
var EditorService = class {
  constructor(pluginClient) {
    this.pluginClient = pluginClient;
  }
  getFallbackDegradedReason(error) {
    if (!(error instanceof DomainError)) {
      return "plugin_unavailable";
    }
    switch (error.code) {
      case "VALIDATION":
        return "plugin_validation_fallback_used";
      case "CONFLICT":
        return "plugin_conflict_fallback_used";
      case "INTERNAL":
        return "plugin_internal_fallback_used";
      default:
        return "plugin_unavailable";
    }
  }
  context = {
    activeFile: null,
    cursor: null,
    selection: "",
    selectionRange: null,
    content: ""
  };
  async getContext() {
    try {
      const context = await this.pluginClient.send("editor.getContext");
      this.context = context;
      return {
        context,
        degraded: false,
        degradedReason: null,
        noActiveEditor: context.activeFile === null
      };
    } catch (error) {
      return {
        context: this.context,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error),
        noActiveEditor: this.context.activeFile === null
      };
    }
  }
  setMockContext(context) {
    this.context = context;
  }
  async insertText(text, position) {
    if (!this.context.cursor || position.line < 0 || position.ch < 0) {
      throw new DomainError("VALIDATION", "Invalid insert position");
    }
    const validationError = validateEditorPosition(
      this.context.content,
      position,
      "Insert position"
    );
    if (validationError) {
      throw new DomainError("VALIDATION", validationError);
    }
    try {
      const context = await this.pluginClient.send("editor.applyCommand", {
        command: "insertText",
        text,
        pos: position
      });
      this.context = context;
      return {
        context,
        degraded: false,
        degradedReason: null,
        noActiveEditor: context.activeFile === null
      };
    } catch (error) {
      this.context = {
        ...this.context,
        content: `${this.context.content}${text}`,
        cursor: position
      };
      return {
        context: this.context,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error),
        noActiveEditor: this.context.activeFile === null
      };
    }
  }
  async replaceRange(text, range) {
    const validationError = validateEditorRange(this.context.content, range);
    if (validationError) {
      throw new DomainError("VALIDATION", validationError);
    }
    try {
      const context = await this.pluginClient.send("editor.applyCommand", {
        command: "replaceRange",
        text,
        range
      });
      this.context = context;
      return {
        context,
        degraded: false,
        degradedReason: null,
        noActiveEditor: context.activeFile === null
      };
    } catch (error) {
      const degradedReason = error instanceof DomainError && error.code !== "INTERNAL" ? this.getFallbackDegradedReason(error) : "plugin_unavailable_range_replace_unsupported";
      return {
        context: this.context,
        degraded: true,
        degradedReason,
        noActiveEditor: this.context.activeFile === null
      };
    }
  }
};

// src/infra/fallbackStorage.ts
import * as fs from "fs";
import * as path from "path";

// ../shared/frontmatter.ts
function detectEol(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
function quoteYamlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function parseQuotedString(rawValue) {
  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1).replaceAll("''", "'");
  }
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue.slice(1, -1);
    }
  }
  return rawValue;
}
function parseScalar(rawValue) {
  const normalized = rawValue.trim();
  if (normalized === "null") {
    return null;
  }
  if (normalized === "true" || normalized === "false") {
    return normalized === "true";
  }
  if (normalized.startsWith("'") && normalized.endsWith("'") || normalized.startsWith('"') && normalized.endsWith('"')) {
    return parseQuotedString(normalized);
  }
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
  }
  if (normalized !== "" && !Number.isNaN(Number(normalized))) {
    return Number(normalized);
  }
  return normalized;
}
function formatScalar(value) {
  if (typeof value === "string") {
    const safePlain = value.length > 0 && !value.includes("\n") && !value.includes("\r") && !value.includes(":") && !value.includes("#") && !value.startsWith(" ") && !value.endsWith(" ") && value !== "null" && value !== "true" && value !== "false";
    return safePlain ? value : quoteYamlString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "null";
}
function renderArrayItem(value) {
  if (Array.isArray(value)) {
    return quoteYamlString(JSON.stringify(value));
  }
  return formatScalar(value);
}
function renderEntry(key, value, eol) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${key}: []`;
    }
    return `${key}:${eol}${value.map((item) => `  - ${renderArrayItem(item)}`).join(eol)}`;
  }
  return `${key}: ${formatScalar(value)}`;
}
function renderFrontmatter(metadata, eol) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return "";
  }
  const lines = entries.map(([key, value]) => renderEntry(key, value, eol));
  return `---${eol}${lines.join(eol)}${eol}---${eol}`;
}
function stripFrontmatter(content) {
  const frontmatterPattern = /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/;
  const matched = content.match(frontmatterPattern);
  if (!matched) {
    return content;
  }
  return content.slice(matched[0].length);
}
function parseFrontmatter(content) {
  const frontmatterPattern = /^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/;
  const matched = content.match(frontmatterPattern);
  if (!matched) {
    return {};
  }
  const metadata = {};
  const lines = matched[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    const separator = rawLine.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = rawLine.slice(0, separator).trim();
    const rawValue = rawLine.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    if (rawValue === "") {
      const items = [];
      let cursor = i + 1;
      while (cursor < lines.length) {
        const itemLine = lines[cursor];
        const itemMatch = itemLine.match(/^\s*-\s+(.*)$/);
        if (!itemMatch) {
          break;
        }
        items.push(parseScalar(itemMatch[1]));
        cursor++;
      }
      if (items.length > 0) {
        metadata[key] = items;
        i = cursor - 1;
        continue;
      }
    }
    metadata[key] = parseScalar(rawValue);
  }
  return metadata;
}
function hasFrontmatter(content) {
  return /^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/.test(content);
}
function applyFrontmatter(content, metadata) {
  const eol = detectEol(content);
  const body = stripFrontmatter(content);
  const frontmatter = renderFrontmatter(metadata, eol);
  return frontmatter ? `${frontmatter}${body}` : body;
}

// src/infra/fallbackStorage.ts
var VAULT_PATH_ENV = "OBSIDIAN_VAULT_PATH";
function getVaultRoot() {
  const configured = process.env[VAULT_PATH_ENV]?.trim();
  if (!configured) {
    throw new DomainError("UNAVAILABLE", `${VAULT_PATH_ENV} is required for note operations`);
  }
  return path.resolve(configured);
}
function normalizeVaultRelativePath(notePath, allowEmpty = false) {
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
function resolveVaultPath(notePath, allowEmpty = false) {
  const normalized = normalizeVaultRelativePath(notePath, allowEmpty);
  const vaultRoot = getVaultRoot();
  const resolved = normalized ? path.resolve(vaultRoot, normalized) : vaultRoot;
  const relative2 = path.relative(vaultRoot, resolved);
  if (relative2 === ".." || relative2.startsWith(`..${path.sep}`) || path.isAbsolute(relative2)) {
    throw new DomainError("VALIDATION", `Path escapes vault root: ${notePath}`);
  }
  return resolved;
}
function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}
function readNote(path7) {
  const filePath = resolveVaultPath(path7);
  if (!fs.existsSync(filePath)) {
    return void 0;
  }
  const stats = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, "utf8");
  return {
    content,
    metadata: parseFrontmatter(content),
    updatedAt: stats.mtimeMs,
    size: stats.size
  };
}
function writeNote(path7, content) {
  const filePath = resolveVaultPath(path7);
  const existing = readNote(path7);
  const metadata = hasFrontmatter(content) ? parseFrontmatter(content) : existing?.metadata ?? {};
  const nextContent = hasFrontmatter(content) ? content : applyFrontmatter(content, metadata);
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, nextContent, "utf8");
  const stats = fs.statSync(filePath);
  return {
    content: nextContent,
    metadata,
    updatedAt: stats.mtimeMs,
    size: stats.size
  };
}
function updateMetadata(path7, metadata) {
  const filePath = resolveVaultPath(path7);
  const existing = readNote(path7);
  if (!existing) {
    throw new DomainError("NOT_FOUND", `Note not found: ${path7}`);
  }
  const mergedMetadata = { ...existing.metadata, ...metadata };
  const nextContent = applyFrontmatter(existing.content, mergedMetadata);
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, nextContent, "utf8");
  const stats = fs.statSync(filePath);
  return {
    content: nextContent,
    metadata: mergedMetadata,
    updatedAt: stats.mtimeMs,
    size: stats.size
  };
}
function getNoteStat(notePath) {
  const filePath = resolveVaultPath(notePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stats = fs.statSync(filePath);
  return {
    updatedAt: stats.mtimeMs,
    size: stats.size,
    absolutePath: filePath
  };
}
function deleteNote(path7) {
  const filePath = resolveVaultPath(path7);
  if (!fs.existsSync(filePath)) {
    return false;
  }
  fs.rmSync(filePath);
  return true;
}
function compareEntries(a, b) {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.path.localeCompare(b.path, "en");
}
function encodeCursor(entry) {
  return Buffer.from(JSON.stringify({ path: entry.path, kind: entry.kind }), "utf8").toString(
    "base64url"
  );
}
function decodeCursor(cursor) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!decoded.path || decoded.kind !== "file" && decoded.kind !== "directory") {
      throw new Error("invalid cursor");
    }
    return { path: decoded.path, kind: decoded.kind };
  } catch {
    throw new DomainError("VALIDATION", "Invalid list cursor");
  }
}
function listEntries(dirPath, options = {}) {
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
  const results = [];
  function scan(dir) {
    const entries2 = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries2) {
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
            size: 0
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
        size: entryStats.size
      });
    }
  }
  scan(rootPath);
  results.sort(compareEntries);
  let startIndex = 0;
  if (options.cursor) {
    const cursor = decodeCursor(options.cursor);
    startIndex = results.findIndex(
      (entry) => compareEntries(entry, {
        path: cursor.path,
        kind: cursor.kind,
        name: "",
        updatedAt: 0,
        size: 0
      }) > 0
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
    truncated: hasMore
  };
}
function moveNote(fromPath, toPath) {
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
function listNoteStats() {
  const vaultRoot = getVaultRoot();
  const results = [];
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(vaultRoot, fullPath).split(path.sep).join("/");
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const stats = fs.statSync(fullPath);
        results.push({
          path: relativePath,
          updatedAt: stats.mtimeMs,
          size: stats.size
        });
      }
    }
  }
  if (fs.existsSync(vaultRoot)) {
    scan(vaultRoot);
  }
  results.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return results;
}
function listNotes() {
  return listNoteStats().map((entry) => {
    const note = readNote(entry.path);
    if (!note) {
      throw new DomainError("NOT_FOUND", `Note not found: ${entry.path}`);
    }
    return {
      path: entry.path,
      updatedAt: entry.updatedAt,
      content: note.content
    };
  });
}

// src/domain/noteService.ts
var NoteService = class {
  constructor(pluginClient, semanticService) {
    this.pluginClient = pluginClient;
    this.semanticService = semanticService;
  }
  getFallbackDegradedReason(error) {
    if (!(error instanceof DomainError)) {
      return "plugin_unavailable";
    }
    switch (error.code) {
      case "NOT_FOUND":
        return "plugin_not_found_fallback_used";
      case "VALIDATION":
        return "plugin_validation_fallback_used";
      case "CONFLICT":
        return "plugin_conflict_fallback_used";
      case "INTERNAL":
        return "plugin_internal_fallback_used";
      default:
        return "plugin_unavailable";
    }
  }
  async read(path7) {
    try {
      await this.pluginClient.send("notes.read", { path: path7 });
      const hit = readNote(path7);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path7}`);
      }
      return {
        content: hit.content,
        metadata: hit.metadata,
        updatedAt: hit.updatedAt,
        size: hit.size,
        degraded: false,
        degradedReason: null
      };
    } catch (error) {
      const hit = readNote(path7);
      if (!hit) {
        throw new DomainError("NOT_FOUND", `Note not found: ${path7}`);
      }
      return {
        content: hit.content,
        metadata: hit.metadata,
        updatedAt: hit.updatedAt,
        size: hit.size,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error)
      };
    }
  }
  async write(path7, content) {
    if (!path7) {
      throw new DomainError("VALIDATION", "path is required");
    }
    try {
      await this.pluginClient.send("notes.write", { path: path7, content });
      const record = writeNote(path7, content);
      this.semanticService?.upsert(path7, record.content, record.updatedAt, record.size);
      return {
        path: path7,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: false,
        degradedReason: null
      };
    } catch (error) {
      const record = writeNote(path7, content);
      this.semanticService?.upsert(path7, record.content, record.updatedAt, record.size);
      return {
        path: path7,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error)
      };
    }
  }
  async delete(path7) {
    try {
      await this.pluginClient.send("notes.delete", { path: path7 });
      this.semanticService?.remove(path7);
      return { deleted: true, degraded: false, degradedReason: null };
    } catch (error) {
      const deleted = deleteNote(path7);
      if (deleted) {
        this.semanticService?.remove(path7);
        return {
          deleted: true,
          degraded: true,
          degradedReason: this.getFallbackDegradedReason(error)
        };
      }
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        throw error;
      }
      throw new DomainError("NOT_FOUND", `Note not found: ${path7}`);
    }
  }
  async updateMetadata(path7, metadata) {
    const existing = readNote(path7);
    if (!existing) {
      throw new DomainError("NOT_FOUND", `Note not found: ${path7}`);
    }
    const mergedMetadata = { ...existing.metadata, ...metadata };
    try {
      await this.pluginClient.send("metadata.update", { path: path7, metadata: mergedMetadata });
      const record = updateMetadata(path7, mergedMetadata);
      this.semanticService?.upsert(path7, record.content, record.updatedAt, record.size);
      return {
        path: path7,
        metadata: record.metadata,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: false,
        degradedReason: null
      };
    } catch (error) {
      const record = updateMetadata(path7, mergedMetadata);
      this.semanticService?.upsert(path7, record.content, record.updatedAt, record.size);
      return {
        path: path7,
        metadata: record.metadata,
        updatedAt: record.updatedAt,
        size: record.size,
        degraded: true,
        degradedReason: this.getFallbackDegradedReason(error)
      };
    }
  }
  list(path7, options) {
    const result = listEntries(path7, options);
    return {
      path: path7,
      ...result,
      degraded: false,
      degradedReason: null
    };
  }
  async move(from, to) {
    try {
      await this.pluginClient.send("notes.move", { from, to });
      this.semanticService?.movePath(from, to);
      return { from, to, degraded: false, degradedReason: null };
    } catch (error) {
      if (error instanceof DomainError && error.code === "CONFLICT") {
        throw error;
      }
      const moved = moveNote(from, to);
      if (!moved) {
        if (error instanceof DomainError) {
          throw error;
        }
        throw new DomainError("NOT_FOUND", `Note not found: ${from}`);
      }
      this.semanticService?.movePath(from, to);
      const degradedReason = this.getFallbackDegradedReason(error);
      return { from, to, degraded: true, degradedReason };
    }
  }
  getIndexStatus(pendingSampleLimit) {
    if (!this.semanticService) {
      return {
        pendingCount: 0,
        indexedNoteCount: 0,
        indexedChunkCount: 0,
        running: false,
        ready: false,
        isEmpty: true,
        modelReady: false,
        pendingSample: [],
        scannedCount: 0,
        skippedCount: 0,
        queuedCount: 0,
        flushedCount: 0,
        removedCount: 0
      };
    }
    return this.semanticService.getIndexStatus(pendingSampleLimit);
  }
  async refreshIndex() {
    if (!this.semanticService) {
      return {
        totalFound: 0,
        scannedCount: 0,
        skippedCount: 0,
        queuedCount: 0,
        flushedCount: 0,
        removedCount: 0,
        pendingCount: 0,
        indexedNoteCount: 0,
        indexedChunkCount: 0,
        modelReady: false
      };
    }
    await this.semanticService.prepareModel();
    const notes = listNoteStats();
    const currentPaths = new Set(notes.map((note) => note.path));
    const removedCount = this.semanticService.removeMissingPaths(currentPaths);
    let skippedCount = 0;
    let queuedCount = 0;
    for (const note of notes) {
      const existing = this.semanticService.getNoteState(note.path);
      if (existing && existing.updatedAt >= note.updatedAt && existing.size === note.size) {
        skippedCount += 1;
        continue;
      }
      const record = readNote(note.path);
      if (!record) {
        continue;
      }
      const wasUpdated = this.semanticService.upsert(
        note.path,
        record.content,
        note.updatedAt,
        note.size
      );
      if (wasUpdated) {
        queuedCount++;
      } else {
        skippedCount += 1;
      }
    }
    let flushedCount = 0;
    while (this.semanticService.getIndexStatus().pendingCount > 0) {
      const flushed = await this.semanticService.flushIndex(25);
      flushedCount += flushed;
      if (flushed === 0) {
        break;
      }
    }
    this.semanticService.recordRefreshStats({
      scannedCount: notes.length,
      skippedCount,
      queuedCount,
      flushedCount,
      removedCount
    });
    const indexStatus = this.semanticService.getIndexStatus();
    return {
      totalFound: notes.length,
      scannedCount: notes.length,
      skippedCount,
      queuedCount,
      flushedCount,
      removedCount,
      pendingCount: indexStatus.pendingCount,
      indexedNoteCount: indexStatus.indexedNoteCount,
      indexedChunkCount: indexStatus.indexedChunkCount,
      modelReady: indexStatus.modelReady
    };
  }
};

// src/domain/embeddingProvider.ts
import fs3 from "fs";
import path3 from "path";
import { env, pipeline } from "@xenova/transformers";

// src/infra/configDir.ts
import fs2 from "fs";
import path2 from "path";
function discoverVaultConfigDir(vaultPath) {
  try {
    const entries = fs2.readdirSync(vaultPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(".")) {
        continue;
      }
      const pluginsDir = path2.join(vaultPath, entry.name, "plugins");
      if (fs2.existsSync(pluginsDir)) {
        return entry.name;
      }
    }
  } catch {
    return null;
  }
  return null;
}
function resolvePluginStoragePath(vaultPath, configDir, ...segments) {
  const normalizedConfigDir = configDir?.trim();
  const pluginRoot = normalizedConfigDir ? path2.join(vaultPath, normalizedConfigDir, "plugins", "companion-mcp") : path2.join(vaultPath, "plugins", "companion-mcp");
  return path2.join(pluginRoot, ...segments);
}

// src/domain/embeddingProvider.ts
var LocalEmbeddingProvider = class {
  kind = "local";
  extractor = null;
  modelName = "Xenova/multilingual-e5-small";
  modelDir;
  constructor(vaultPath, configDir) {
    this.modelDir = resolvePluginStoragePath(vaultPath, configDir, "models");
    this.applyModelPath();
  }
  /**
   * Updates the model directory dynamically (called after plugin handshake).
   */
  updateModelPath(vaultPath, configDir) {
    this.modelDir = resolvePluginStoragePath(vaultPath, configDir, "models");
    this.applyModelPath();
  }
  applyModelPath() {
    if (!fs3.existsSync(this.modelDir)) {
      fs3.mkdirSync(this.modelDir, { recursive: true });
    }
    env.allowRemoteModels = false;
    env.localModelPath = this.modelDir;
    env.cacheDir = this.modelDir;
  }
  async isReady() {
    const modelPath = path3.join(this.modelDir, this.modelName);
    try {
      await fs3.promises.access(modelPath);
      return true;
    } catch {
      return false;
    }
  }
  getRuntimeState() {
    return {
      modelReady: this.extractor !== null || fs3.existsSync(path3.join(this.modelDir, this.modelName))
    };
  }
  async prepare() {
    if (this.extractor) return;
    try {
      env.allowRemoteModels = true;
      this.extractor = await pipeline(
        "feature-extraction",
        this.modelName
      );
      env.allowRemoteModels = false;
    } catch (error) {
      env.allowRemoteModels = false;
      throw error;
    }
  }
  async getExtractor() {
    if (!this.extractor) {
      try {
        this.extractor = await pipeline(
          "feature-extraction",
          this.modelName
        );
      } catch (error) {
        throw new Error(
          `Model not found locally. Please run 'refresh_semantic_index' to download models. (Details: ${String(error)})`
        );
      }
    }
    return this.extractor;
  }
  /**
   * Generate embeddings using multilingual-e5-small.
   */
  async embed(text, isQuery = false) {
    const extractor = await this.getExtractor();
    const prefix = isQuery ? "query: " : "passage: ";
    const output = await extractor(`${prefix}${text}`, {
      pooling: "mean",
      normalize: true
    });
    return Array.from(output.data);
  }
};
var RemoteEmbeddingProvider = class {
  kind = "remote";
  isReady() {
    return Promise.resolve(true);
  }
  prepare() {
    return Promise.resolve();
  }
  getRuntimeState() {
    return { modelReady: true };
  }
  embed(text, _isQuery = false) {
    const normalized = text.trim().toLowerCase();
    const score = normalized.length + 1;
    return Promise.resolve([score, score / 2, score / 4]);
  }
};
function createEmbeddingProvider(preferRemote = false, vaultPath = "", configDir = "") {
  if (preferRemote) {
    return new RemoteEmbeddingProvider();
  }
  const effectiveVaultPath = vaultPath || "/tmp";
  const effectiveConfigDir = configDir || process.env.OBSIDIAN_CONFIG_DIR || discoverVaultConfigDir(effectiveVaultPath) || "";
  return new LocalEmbeddingProvider(effectiveVaultPath, effectiveConfigDir);
}

// src/domain/indexingQueue.ts
var IndexingQueue = class {
  queue = [];
  running = false;
  getPendingCount() {
    return this.queue.length;
  }
  isRunning() {
    return this.running;
  }
  getPendingSample(limit) {
    return this.queue.slice(0, Math.max(limit, 0)).map((job) => job.path);
  }
  enqueue(job) {
    const existingIndex = this.queue.findIndex((item) => item.path === job.path);
    if (existingIndex !== -1) {
      const existing = this.queue[existingIndex];
      if (existing.updatedAt > job.updatedAt) {
        return false;
      }
      if (existing.updatedAt === job.updatedAt && existing.size === job.size) {
        return false;
      }
      this.queue.splice(existingIndex, 1);
    }
    this.queue.push(job);
    return true;
  }
  renamePath(from, to) {
    const existingIndex = this.queue.findIndex((item) => item.path === from);
    if (existingIndex === -1) {
      return;
    }
    this.queue[existingIndex] = {
      ...this.queue[existingIndex],
      path: to
    };
  }
  removePath(path7) {
    const existingIndex = this.queue.findIndex((item) => item.path === path7);
    if (existingIndex !== -1) {
      this.queue.splice(existingIndex, 1);
    }
  }
  async process(handler, maxItems = 25) {
    if (this.running) {
      return 0;
    }
    this.running = true;
    let processed = 0;
    try {
      while (this.queue.length > 0 && processed < maxItems) {
        const job = this.queue.shift();
        if (!job) {
          break;
        }
        await handler(job);
        processed += 1;
      }
      return processed;
    } finally {
      this.running = false;
    }
  }
};

// src/domain/noteDocument.ts
import path4 from "path";

// src/domain/responseBounds.ts
var TOOL_TEXT_MAX_CHARS = 4e3;
var RESPONSE_EXCERPT_MAX_CHARS = 500;
var RESPONSE_ARRAY_MAX_ITEMS = 25;
var RESPONSE_OBJECT_MAX_KEYS = 50;
function truncateText(text, maxChars) {
  if (text.length <= maxChars) {
    return { text, truncated: false, totalChars: text.length };
  }
  return {
    text: `${text.slice(0, Math.max(maxChars - 1, 0))}\u2026`,
    truncated: true,
    totalChars: text.length
  };
}
function boundStructuredValue(value, {
  maxStringChars = RESPONSE_EXCERPT_MAX_CHARS,
  maxArrayItems = RESPONSE_ARRAY_MAX_ITEMS,
  maxObjectKeys = RESPONSE_OBJECT_MAX_KEYS
} = {}) {
  if (typeof value === "string") {
    const truncated = truncateText(value, maxStringChars);
    return { value: truncated.text, truncated: truncated.truncated };
  }
  if (value === null || value === void 0 || typeof value === "number" || typeof value === "boolean") {
    return { value, truncated: false };
  }
  if (typeof value === "bigint") {
    return { value: value.toString(), truncated: false };
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, maxArrayItems);
    let truncated = value.length > items.length;
    const boundedItems = items.map((item) => {
      const bounded = boundStructuredValue(item, {
        maxStringChars,
        maxArrayItems,
        maxObjectKeys
      });
      if (bounded.truncated) {
        truncated = true;
      }
      return bounded.value;
    });
    return { value: boundedItems, truncated };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    const limitedEntries = entries.slice(0, maxObjectKeys);
    let truncated = entries.length > limitedEntries.length;
    const boundedObject = Object.fromEntries(
      limitedEntries.map(([key, nestedValue]) => {
        const bounded = boundStructuredValue(nestedValue, {
          maxStringChars,
          maxArrayItems,
          maxObjectKeys
        });
        if (bounded.truncated) {
          truncated = true;
        }
        return [key, bounded.value];
      })
    );
    return { value: boundedObject, truncated };
  }
  return { value: null, truncated: true };
}

// src/domain/noteDocument.ts
var SEMANTIC_CHUNK_MAX_CHARS = 1200;
function normalizeHeading(title) {
  return title.trim().replace(/\s+/g, " ");
}
function buildHeadingMatches(content) {
  const lines = getEditorLines(content);
  const stack = [];
  const matches = [];
  let fenceMarker = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^(```+|~~~+)/);
    if (fence) {
      const marker = fence[1];
      if (fenceMarker === null) {
        fenceMarker = marker;
      } else if (marker.startsWith(fenceMarker[0])) {
        fenceMarker = null;
      }
      continue;
    }
    if (fenceMarker) {
      continue;
    }
    const match = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!match) {
      continue;
    }
    const level = match[1].length;
    const title = normalizeHeading(match[2]);
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    stack.push({ level, title });
    matches.push({
      path: stack.map((item) => item.title),
      level,
      title,
      startLine: index,
      endLine: lines.length - 1
    });
  }
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches.slice(index + 1).find((candidate) => candidate.level <= current.level);
    current.endLine = next ? Math.max(next.startLine - 1, current.startLine) : lines.length - 1;
  }
  return matches;
}
function lineToRange(lines, startLine, endLine) {
  const safeEndLine = Math.min(endLine, Math.max(lines.length - 1, 0));
  return {
    from: { line: startLine, ch: 0 },
    to: { line: safeEndLine, ch: lines[safeEndLine]?.length ?? 0 }
  };
}
function findHeadingRange(content, headingPath) {
  const normalizedTarget = headingPath.map(normalizeHeading);
  const matches = buildHeadingMatches(content).filter(
    (candidate) => candidate.path.length >= normalizedTarget.length && candidate.path.slice(candidate.path.length - normalizedTarget.length).every((value, index) => value === normalizedTarget[index])
  );
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new DomainError("CONFLICT", `Heading path is ambiguous: ${headingPath.join(" > ")}`);
  }
  const [match] = matches;
  return { startLine: match.startLine, endLine: match.endLine };
}
function findFrontmatterRange(content) {
  const matched = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/);
  if (!matched) {
    return null;
  }
  const lines = getEditorLines(matched[0]);
  return { startLine: 0, endLine: Math.max(lines.length - 1, 0) };
}
function findBlockRange(content, blockId) {
  const lines = getEditorLines(content);
  const blockPattern = new RegExp(`(?:\\s|^)\\^${blockId}\\s*$`);
  const blockLine = lines.findIndex((line) => blockPattern.test(line));
  if (blockLine === -1) {
    return null;
  }
  const headings = buildHeadingMatches(content);
  const enclosingHeading = headings.filter((heading) => heading.startLine <= blockLine && heading.endLine >= blockLine).sort((a, b) => b.path.length - a.path.length)[0];
  const minLine = enclosingHeading ? enclosingHeading.startLine : 0;
  const maxLine = enclosingHeading ? enclosingHeading.endLine : lines.length - 1;
  let startLine = blockLine;
  while (startLine > minLine && lines[startLine - 1]?.trim().length > 0) {
    startLine -= 1;
  }
  let endLine = blockLine;
  while (endLine < maxLine && lines[endLine + 1]?.trim().length > 0) {
    endLine += 1;
  }
  return { startLine, endLine };
}
function normalizeLineRange(lines, startLine, endLine) {
  if (startLine < 0 || endLine < 0) {
    throw new DomainError("VALIDATION", "Line anchors must be non-negative");
  }
  if (startLine > endLine) {
    throw new DomainError("VALIDATION", "Anchor startLine must be <= endLine");
  }
  if (startLine >= lines.length || endLine >= lines.length) {
    throw new DomainError(
      "VALIDATION",
      `Anchor line range ${startLine}-${endLine} exceeds content line count ${lines.length}`
    );
  }
  return { startLine, endLine };
}
function buildRangeText(content, range) {
  try {
    return sliceEditorRange(content, range);
  } catch (error) {
    throw new DomainError(
      "VALIDATION",
      error instanceof Error ? error.message : "Invalid target range"
    );
  }
}
function buildRevisionToken(notePath, updatedAt, size) {
  return Buffer.from(
    JSON.stringify({
      path: notePath,
      updatedAt: Math.trunc(updatedAt),
      size
    }),
    "utf8"
  ).toString("base64url");
}
function readTitleFromPath(notePath) {
  return path4.posix.basename(notePath, ".md");
}
function resolveNoteSelection(content, anchor) {
  const lines = getEditorLines(content);
  const totalLines = lines.length;
  let resolvedRange = null;
  switch (anchor.type) {
    case "full":
      resolvedRange = {
        startLine: 0,
        endLine: Math.max(totalLines - 1, 0)
      };
      break;
    case "frontmatter":
      resolvedRange = anchor.startLine !== void 0 && anchor.endLine !== void 0 ? normalizeLineRange(lines, anchor.startLine, anchor.endLine) : findFrontmatterRange(content);
      if (!resolvedRange) {
        throw new DomainError("NOT_FOUND", "Frontmatter not found");
      }
      break;
    case "heading":
      resolvedRange = anchor.startLine !== void 0 && anchor.endLine !== void 0 ? normalizeLineRange(lines, anchor.startLine, anchor.endLine) : findHeadingRange(content, anchor.headingPath);
      if (!resolvedRange) {
        throw new DomainError("NOT_FOUND", `Heading not found: ${anchor.headingPath.join(" > ")}`);
      }
      break;
    case "block":
      resolvedRange = anchor.startLine !== void 0 && anchor.endLine !== void 0 ? normalizeLineRange(lines, anchor.startLine, anchor.endLine) : findBlockRange(content, anchor.blockId);
      if (!resolvedRange) {
        throw new DomainError("NOT_FOUND", `Block not found: ^${anchor.blockId}`);
      }
      break;
    case "line":
      resolvedRange = normalizeLineRange(lines, anchor.startLine, anchor.endLine);
      break;
    default:
      throw new DomainError("VALIDATION", "Unsupported note anchor");
  }
  const range = lineToRange(lines, resolvedRange.startLine, resolvedRange.endLine);
  return {
    anchor: anchor.type === "full" ? anchor : anchor.type === "heading" ? {
      ...anchor,
      startLine: resolvedRange.startLine,
      endLine: resolvedRange.endLine
    } : anchor.type === "block" ? {
      ...anchor,
      startLine: resolvedRange.startLine,
      endLine: resolvedRange.endLine
    } : anchor.type === "frontmatter" ? {
      ...anchor,
      startLine: resolvedRange.startLine,
      endLine: resolvedRange.endLine
    } : {
      ...anchor,
      startLine: resolvedRange.startLine,
      endLine: resolvedRange.endLine
    },
    range,
    text: buildRangeText(content, range),
    totalLines
  };
}
function resolveActiveSelection(content, anchor) {
  const lines = getEditorLines(content);
  const totalLines = lines.length;
  switch (anchor.type) {
    case "full": {
      const range = lineToRange(lines, 0, Math.max(totalLines - 1, 0));
      return {
        anchor,
        range,
        text: buildRangeText(content, range),
        totalLines
      };
    }
    case "selection":
    case "range": {
      const validationError = validateEditorRange(content, anchor.range);
      if (validationError) {
        throw new DomainError("VALIDATION", validationError);
      }
      return {
        anchor,
        range: anchor.range,
        text: buildRangeText(content, anchor.range),
        totalLines
      };
    }
    case "cursor":
      return {
        anchor,
        range: null,
        text: "",
        totalLines
      };
    default:
      throw new DomainError("VALIDATION", "Unsupported active anchor");
  }
}
function replaceResolvedSelection(content, selection, replacement) {
  if (!selection.range) {
    throw new DomainError("VALIDATION", "Target does not support direct replacement");
  }
  try {
    return replaceEditorRangeContent(content, selection.range, replacement);
  } catch (error) {
    throw new DomainError(
      "VALIDATION",
      error instanceof Error ? error.message : "Failed to replace selection"
    );
  }
}
function applyEditChange(currentText, change) {
  switch (change.type) {
    case "replaceTarget":
      return { nextText: change.content, warnings: [] };
    case "append":
      return { nextText: `${currentText}${change.content}`, warnings: [] };
    case "prepend":
      return { nextText: `${change.content}${currentText}`, warnings: [] };
    case "insertAtCursor":
      throw new DomainError(
        "VALIDATION",
        "insertAtCursor is only supported with active cursor targets"
      );
    case "replaceText":
      return applyExactTextReplace(currentText, change);
    default:
      throw new DomainError("VALIDATION", "Unsupported edit change");
  }
}
function applyExactTextReplace(currentText, change) {
  if (!change.find) {
    throw new DomainError("VALIDATION", "replaceText.find must not be empty");
  }
  const matches = [];
  let searchFrom = 0;
  while (searchFrom <= currentText.length) {
    const index = currentText.indexOf(change.find, searchFrom);
    if (index === -1) {
      break;
    }
    matches.push(index);
    searchFrom = index + change.find.length;
  }
  if (matches.length === 0) {
    throw new DomainError("NOT_FOUND", `Text to replace was not found: ${change.find}`);
  }
  const targetIndexes = change.occurrence === "first" ? [matches[0]] : change.occurrence === "last" ? [matches[matches.length - 1]] : change.occurrence === "all" ? matches : Number.isInteger(change.occurrence) && change.occurrence > 0 ? matches[change.occurrence - 1] !== void 0 ? [matches[change.occurrence - 1]] : [] : [];
  if (targetIndexes.length === 0) {
    throw new DomainError("CONFLICT", "Requested occurrence could not be resolved");
  }
  if (change.occurrence === "all" && matches.length > 1) {
    let nextText2 = currentText;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const start2 = matches[index];
      nextText2 = nextText2.slice(0, start2) + change.replace + nextText2.slice(start2 + change.find.length);
    }
    return { nextText: nextText2, warnings: [] };
  }
  if (change.occurrence !== "all" && matches.length > 1 && typeof change.occurrence !== "number") {
    return {
      nextText: currentText.slice(0, targetIndexes[0]) + change.replace + currentText.slice(targetIndexes[0] + change.find.length),
      warnings: [`Multiple matches found; applied ${change.occurrence} occurrence.`]
    };
  }
  const start = targetIndexes[0];
  const nextText = currentText.slice(0, start) + change.replace + currentText.slice(start + change.find.length);
  return { nextText, warnings: [] };
}
function compareExpectedText(actual, expected) {
  if (expected !== void 0 && actual !== expected) {
    throw new DomainError("CONFLICT", "Target text no longer matches expected currentText");
  }
}
function compareExpectedRevision(actual, expected) {
  if (expected !== void 0 && expected !== actual) {
    throw new DomainError("CONFLICT", "Target revision no longer matches expected revision");
  }
}
function findSnippetForQuery(content, query) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }
  const lines = getEditorLines(content);
  const lowerQuery = trimmedQuery.toLowerCase();
  const matchIndex = lines.findIndex((line) => line.toLowerCase().includes(lowerQuery));
  if (matchIndex === -1) {
    return null;
  }
  const windowStart = Math.max(matchIndex - 1, 0);
  const windowEnd = Math.min(matchIndex + 1, lines.length - 1);
  const snippet = truncateText(
    lines.slice(windowStart, windowEnd + 1).join("\n").trim(),
    RESPONSE_EXCERPT_MAX_CHARS
  );
  return {
    text: snippet.text,
    startLine: windowStart,
    endLine: windowEnd
  };
}
function buildDocumentMap(content) {
  const headings = buildHeadingMatches(content).map((heading) => ({
    path: heading.path,
    level: heading.level,
    startLine: heading.startLine,
    endLine: heading.endLine
  }));
  const lines = getEditorLines(content);
  const blocks = lines.map((line, lineIndex) => {
    const match = line.match(/(?:\s|^)\^([A-Za-z0-9-]+)\s*$/);
    return match ? {
      blockId: match[1],
      startLine: lineIndex,
      endLine: lineIndex
    } : null;
  }).filter(
    (value) => value !== null
  );
  return {
    headings,
    blocks,
    frontmatterFields: Object.keys(parseFrontmatter(content))
  };
}
function buildSemanticChunks(notePath, content) {
  const lines = getEditorLines(content);
  if (lines.length === 0) {
    return [];
  }
  const headings = buildHeadingMatches(content);
  const chunks = [];
  let currentStart = 0;
  while (currentStart < lines.length) {
    const currentEnd = Math.min(currentStart + 7, lines.length - 1);
    const chunkText = lines.slice(currentStart, currentEnd + 1).join("\n").trim();
    if (chunkText.length > 0) {
      const heading = headings.filter(
        (candidate) => candidate.startLine <= currentStart && candidate.endLine >= currentEnd
      ).sort((a, b) => b.path.length - a.path.length)[0];
      chunks.push({
        id: `${notePath}:${currentStart}-${currentEnd}`,
        path: notePath,
        text: boundSemanticChunkText(chunkText),
        startLine: currentStart,
        endLine: currentEnd,
        headingPath: heading?.path ?? null
      });
    }
    currentStart = currentEnd + 1;
  }
  return chunks;
}
function boundSemanticChunkText(text, maxChars = SEMANTIC_CHUNK_MAX_CHARS) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(maxChars - 1, 0))}\u2026`;
}

// src/domain/semanticService.ts
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}
function isSnapshot(value) {
  return typeof value === "object" && value !== null && "chunks" in value && "noteStates" in value && value.chunks instanceof Map && value.noteStates instanceof Map;
}
var SemanticService = class {
  chunks = /* @__PURE__ */ new Map();
  chunkIdsByPath = /* @__PURE__ */ new Map();
  noteStates = /* @__PURE__ */ new Map();
  provider;
  queue = new IndexingQueue();
  lastRefreshStats = {
    scannedCount: 0,
    skippedCount: 0,
    queuedCount: 0,
    flushedCount: 0,
    removedCount: 0
  };
  constructor(preferRemote = false, vaultPath = "", configDir = "") {
    this.provider = createEmbeddingProvider(preferRemote, vaultPath, configDir);
  }
  setNoteState(path7, updatedAt, size, chunkIds) {
    this.chunkIdsByPath.set(path7, chunkIds);
    this.noteStates.set(path7, {
      path: path7,
      updatedAt,
      size,
      chunkIds
    });
  }
  replaceNoteChunks(path7, nextChunks, updatedAt, size) {
    const previousChunkIds = this.chunkIdsByPath.get(path7) ?? [];
    for (const chunkId of previousChunkIds) {
      this.chunks.delete(chunkId);
    }
    const nextChunkIds = nextChunks.map((chunk) => chunk.id);
    for (const chunk of nextChunks) {
      this.chunks.set(chunk.id, chunk);
    }
    this.setNoteState(path7, updatedAt, size, nextChunkIds);
  }
  rebuildChunkIds() {
    this.chunkIdsByPath = /* @__PURE__ */ new Map();
    for (const [id, chunk] of this.chunks.entries()) {
      const chunkIds = this.chunkIdsByPath.get(chunk.path) ?? [];
      chunkIds.push(id);
      this.chunkIdsByPath.set(chunk.path, chunkIds);
    }
  }
  seedNoteStateFromChunks(path7) {
    if (this.noteStates.has(path7)) {
      return;
    }
    const chunkIds = this.chunkIdsByPath.get(path7) ?? [];
    const firstChunk = chunkIds.length > 0 ? this.chunks.get(chunkIds[0]) : void 0;
    if (!firstChunk) {
      return;
    }
    const stat = getNoteStat(path7);
    const derivedSize = stat?.size ?? Buffer.byteLength(
      chunkIds.map((chunkId) => this.chunks.get(chunkId)?.text ?? "").filter((text) => text.length > 0).join("\n"),
      "utf8"
    );
    this.setNoteState(path7, firstChunk.updatedAt, derivedSize, chunkIds);
  }
  upsert(path7, content, updatedAt, size) {
    const existing = this.noteStates.get(path7);
    if (existing && existing.updatedAt >= updatedAt && existing.size === size) {
      return false;
    }
    return this.queue.enqueue({ path: path7, content, updatedAt, size });
  }
  flushIndex(maxItems = 25) {
    return this.queue.process(async (job) => {
      const chunks = buildSemanticChunks(job.path, job.content);
      const nextChunks = [];
      for (const chunk of chunks) {
        const embedding = await this.provider.embed(chunk.text, false);
        nextChunks.push({
          id: chunk.id,
          path: chunk.path,
          title: readTitleFromPath(chunk.path),
          text: chunk.text,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          headingPath: chunk.headingPath,
          updatedAt: job.updatedAt,
          embedding
        });
      }
      this.replaceNoteChunks(job.path, nextChunks, job.updatedAt, job.size);
    }, maxItems);
  }
  remove(path7) {
    const existingChunkIds = this.noteStates.get(path7)?.chunkIds ?? this.chunkIdsByPath.get(path7) ?? [];
    for (const chunkId of existingChunkIds) {
      this.chunks.delete(chunkId);
    }
    this.chunkIdsByPath.delete(path7);
    this.noteStates.delete(path7);
    this.queue.removePath(path7);
  }
  removeMissingPaths(existingPaths) {
    let removedCount = 0;
    for (const path7 of Array.from(this.noteStates.keys())) {
      if (existingPaths.has(path7)) {
        continue;
      }
      this.remove(path7);
      removedCount += 1;
    }
    return removedCount;
  }
  movePath(from, to) {
    const existing = this.noteStates.get(from);
    const existingChunkIds = existing?.chunkIds ?? this.chunkIdsByPath.get(from) ?? [];
    if (existingChunkIds.length === 0) {
      if (existing) {
        this.noteStates.delete(from);
        this.setNoteState(to, existing.updatedAt, existing.size, []);
      }
      this.queue.renamePath(from, to);
      return;
    }
    const movedChunks = [];
    for (const chunkId of existingChunkIds) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) {
        continue;
      }
      this.chunks.delete(chunkId);
      movedChunks.push({
        ...chunk,
        id: `${to}:${chunk.startLine}-${chunk.endLine}`,
        path: to,
        title: readTitleFromPath(to)
      });
    }
    this.chunkIdsByPath.delete(from);
    this.noteStates.delete(from);
    this.replaceNoteChunks(to, movedChunks, existing?.updatedAt ?? Date.now(), existing?.size ?? 0);
    this.queue.renamePath(from, to);
  }
  recordRefreshStats(stats) {
    this.lastRefreshStats = stats;
  }
  getNoteState(path7) {
    const state = this.noteStates.get(path7);
    if (!state) {
      return void 0;
    }
    return { ...state, chunkIds: [...state.chunkIds] };
  }
  getIndexedPaths() {
    return Array.from(this.noteStates.keys());
  }
  getIndexStatus(sampleLimit = 20) {
    const pendingCount = this.queue.getPendingCount();
    const modelReady = this.provider.getRuntimeState().modelReady;
    return {
      pendingCount,
      indexedNoteCount: this.noteStates.size,
      indexedChunkCount: this.chunks.size,
      running: this.queue.isRunning(),
      ready: pendingCount === 0 && modelReady,
      isEmpty: this.chunks.size === 0,
      modelReady,
      pendingSample: this.queue.getPendingSample(sampleLimit),
      scannedCount: this.lastRefreshStats.scannedCount,
      skippedCount: this.lastRefreshStats.skippedCount,
      queuedCount: this.lastRefreshStats.queuedCount,
      flushedCount: this.lastRefreshStats.flushedCount,
      removedCount: this.lastRefreshStats.removedCount
    };
  }
  async prepareModel() {
    await this.provider.prepare();
  }
  isModelReady() {
    return this.provider.isReady();
  }
  async searchWithStatus(query, options) {
    if (this.queue.getPendingCount() > 0) {
      await this.flushIndex(Math.max(options.topK * 2, 10));
    }
    return {
      matches: await this.search(query, options),
      indexStatus: this.getIndexStatus()
    };
  }
  async search(query, options) {
    if (this.chunks.size === 0) {
      return [];
    }
    const queryVector = await this.provider.embed(query, true);
    const allowedPaths = options.notePaths ? new Set(options.notePaths) : null;
    const perNoteCount = /* @__PURE__ */ new Map();
    return Array.from(this.chunks.values()).filter((chunk) => {
      if (options.pathPrefix && !chunk.path.startsWith(options.pathPrefix)) {
        return false;
      }
      if (allowedPaths && !allowedPaths.has(chunk.path)) {
        return false;
      }
      return true;
    }).map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryVector, chunk.embedding)
    })).filter((chunk) => options.minScore === void 0 ? true : chunk.score >= options.minScore).sort((left, right) => right.score - left.score).filter((chunk) => {
      const current = perNoteCount.get(chunk.path) ?? 0;
      if (current >= options.maxPerNote) {
        return false;
      }
      perNoteCount.set(chunk.path, current + 1);
      return true;
    }).slice(0, options.topK);
  }
  getProvider() {
    return this.provider;
  }
  getNotes() {
    return this.chunks;
  }
  getSnapshot() {
    return {
      chunks: new Map(this.chunks),
      noteStates: new Map(
        Array.from(this.noteStates.entries()).map(([path7, state]) => [
          path7,
          { ...state, chunkIds: [...state.chunkIds] }
        ])
      )
    };
  }
  setNotes(notes) {
    this.setSnapshot(notes);
  }
  setSnapshot(snapshot) {
    this.chunks = /* @__PURE__ */ new Map();
    this.chunkIdsByPath = /* @__PURE__ */ new Map();
    this.noteStates = /* @__PURE__ */ new Map();
    if (isSnapshot(snapshot)) {
      this.chunks = new Map(snapshot.chunks);
      this.rebuildChunkIds();
      for (const [path7, state] of snapshot.noteStates.entries()) {
        const chunkIds = state.chunkIds.filter((chunkId) => this.chunks.has(chunkId));
        this.setNoteState(path7, state.updatedAt, state.size, chunkIds);
      }
      for (const path7 of this.chunkIdsByPath.keys()) {
        this.seedNoteStateFromChunks(path7);
      }
      return;
    }
    for (const [id, value] of snapshot.entries()) {
      if ("startLine" in value && "endLine" in value && "text" in value) {
        this.chunks.set(id, value);
        const chunkIds = this.chunkIdsByPath.get(value.path) ?? [];
        chunkIds.push(id);
        this.chunkIdsByPath.set(value.path, chunkIds);
        continue;
      }
      const note = readNote(value.path);
      if (note) {
        this.upsert(value.path, note.content, note.updatedAt, note.size);
        continue;
      }
      const chunkId = `${value.path}:0-0`;
      this.chunks.set(chunkId, {
        id: chunkId,
        path: value.path,
        title: readTitleFromPath(value.path),
        text: boundSemanticChunkText(value.snippet),
        startLine: 0,
        endLine: 0,
        headingPath: null,
        updatedAt: value.updatedAt,
        embedding: value.embedding
      });
      this.setNoteState(
        value.path,
        value.updatedAt,
        Buffer.byteLength(boundSemanticChunkText(value.snippet), "utf8"),
        [chunkId]
      );
    }
    for (const path7 of this.chunkIdsByPath.keys()) {
      this.seedNoteStateFromChunks(path7);
    }
  }
};

// src/infra/pluginClient.ts
import http from "http";
import https from "https";

// ../shared/protocol.ts
var PROTOCOL_VERSION = "1.0.0";
function isJsonRpcFailure(input) {
  return input.error !== void 0;
}

// src/infra/pluginClient.ts
var PluginClient = class {
  constructor(maxRetries = 3, expectedProtocolVersion = PROTOCOL_VERSION) {
    this.maxRetries = maxRetries;
    this.expectedProtocolVersion = expectedProtocolVersion;
    const port = process.env.OBSIDIAN_PLUGIN_PORT || "3033";
    this.pluginUrl = `http://127.0.0.1:${port}`;
    this.configDir = process.env.OBSIDIAN_CONFIG_DIR || null;
  }
  availability = "unavailable";
  degradedReason = "startup_not_attempted";
  lastCorrelationId = null;
  retryCount = 0;
  pluginUrl;
  configDir = null;
  async connect() {
    this.retryCount = 0;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      this.retryCount = attempt;
      try {
        const result = await this.performHandshake();
        const receivedProtocolVersion = result.protocolVersion ?? PROTOCOL_VERSION;
        if (receivedProtocolVersion !== this.expectedProtocolVersion) {
          const error = new DomainError(
            "CONFLICT",
            `Protocol version mismatch: expected ${this.expectedProtocolVersion}, got ${receivedProtocolVersion}`
          );
          this.transition("degraded", "protocol_mismatch", error.correlationId);
          throw error;
        }
        if (result.configDir) {
          this.configDir = result.configDir;
          logInfo(`plugin reported config directory: ${this.configDir}`);
        }
        this.transition("normal", null, null);
        logInfo(`plugin connected on attempt ${attempt}/${this.maxRetries}`);
        return result;
      } catch (error) {
        if (error instanceof DomainError && error.code === "CONFLICT") {
          throw error;
        }
        if (attempt < this.maxRetries) {
          logInfo(`plugin handshake retry ${attempt}/${this.maxRetries}`);
          await new Promise((resolve2) => setTimeout(resolve2, 500));
          continue;
        }
        const correlationId = error instanceof DomainError ? error.correlationId : `corr-${Date.now()}`;
        this.transition("degraded", "retry_exhausted", correlationId);
        logInfo("Plugin handshake failed, continuing in degraded mode.");
        return {
          capabilities: [],
          availability: "degraded"
        };
      }
    }
    return {
      capabilities: [],
      availability: "degraded"
    };
  }
  getAvailability() {
    return this.availability;
  }
  getConfigDir() {
    return this.configDir;
  }
  getRuntimeStatus() {
    return {
      availability: this.availability,
      degradedReason: this.degradedReason,
      retryCount: this.retryCount,
      lastCorrelationId: this.lastCorrelationId
    };
  }
  async send(method, params) {
    if (this.availability === "unavailable") {
      const error = new DomainError(
        "UNAVAILABLE",
        "Plugin is unavailable",
        this.lastCorrelationId ?? void 0
      );
      this.transition("unavailable", "plugin_unavailable", error.correlationId);
      throw error;
    }
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
      protocolVersion: PROTOCOL_VERSION
    };
    try {
      const json = await this.postJson(request);
      if (isJsonRpcFailure(json)) {
        this.transition("normal", null, null);
        throw new DomainError(
          json.error.code,
          json.error.message,
          json.error.data?.correlationId
        );
      }
      this.transition("normal", null, null);
      return json.result;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      const correlationId = error instanceof DomainError ? error.correlationId : `corr-${Date.now()}`;
      this.transition("degraded", "plugin_unavailable", correlationId);
      throw new DomainError("UNAVAILABLE", "Plugin communication failed", correlationId);
    }
  }
  async performHandshake() {
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "health.ping",
      protocolVersion: PROTOCOL_VERSION
    };
    const json = await this.postJson(request);
    if (isJsonRpcFailure(json)) {
      throw new Error(json.error.message);
    }
    return {
      ...json.result,
      protocolVersion: json.protocolVersion
    };
  }
  postJson(request) {
    const url = new URL(this.pluginUrl);
    const transport = url.protocol === "https:" ? https : http;
    return new Promise((resolve2, reject) => {
      const payload = JSON.stringify(request);
      const httpRequest = transport.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`HTTP error! status: ${response.statusCode ?? "unknown"}`));
              return;
            }
            try {
              resolve2(JSON.parse(rawBody));
            } catch (error) {
              reject(error instanceof Error ? error : new Error("Failed to parse plugin response"));
            }
          });
        }
      );
      httpRequest.on("error", (error) => {
        reject(error instanceof Error ? error : new Error("Plugin request failed"));
      });
      httpRequest.write(payload);
      httpRequest.end();
    });
  }
  transition(availability, degradedReason, correlationId) {
    this.availability = availability;
    this.degradedReason = degradedReason;
    this.lastCorrelationId = correlationId;
  }
};

// src/infra/vectorStore.ts
import { promises as fs4 } from "fs";
import path5 from "path";
var VectorStore = class {
  indexPath;
  constructor(vaultPath, configDir) {
    this.indexPath = path5.join(
      vaultPath,
      configDir,
      "plugins",
      "companion-mcp",
      "data",
      "semantic-index.json"
    );
  }
  /**
   * Updates the index path dynamically (called after plugin handshake).
   */
  updateIndexPath(vaultPath, configDir) {
    this.indexPath = path5.join(
      vaultPath,
      configDir,
      "plugins",
      "companion-mcp",
      "data",
      "semantic-index.json"
    );
  }
  async load() {
    try {
      try {
        await fs4.access(this.indexPath);
      } catch {
        return /* @__PURE__ */ new Map();
      }
      const raw = await fs4.readFile(this.indexPath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        logInfo(`vector index loaded: ${data.length} chunk entries from ${this.indexPath}`);
        return new Map(data);
      }
      logInfo(
        `vector index loaded: ${data.chunks.length} chunk entries and ${data.noteStates.length} note states from ${this.indexPath}`
      );
      return {
        chunks: new Map(data.chunks),
        noteStates: new Map(data.noteStates)
      };
    } catch (error) {
      logError(`failed to load vector index: ${String(error)}`);
      return /* @__PURE__ */ new Map();
    }
  }
  async save(snapshot) {
    try {
      const dir = path5.dirname(this.indexPath);
      await fs4.mkdir(dir, { recursive: true });
      const data = {
        version: 2,
        chunks: Array.from(snapshot.chunks.entries()),
        noteStates: Array.from(snapshot.noteStates.entries())
      };
      await fs4.writeFile(this.indexPath, JSON.stringify(data), "utf-8");
      logInfo(
        `vector index saved: ${snapshot.chunks.size} chunk entries and ${snapshot.noteStates.size} note states to ${this.indexPath}`
      );
    } catch (error) {
      logError(`failed to save vector index: ${String(error)}`);
    }
  }
  getIndexPath() {
    return this.indexPath;
  }
};

// src/prompts/agentRuntimeReview.ts
import { z } from "zod";

// src/constants/promptNames.ts
var PROMPT_NAMES = {
  CONTEXT_REWRITE: "workflow_context_rewrite",
  SEARCH_THEN_INSERT: "workflow_search_then_insert",
  AGENT_RUNTIME_REVIEW: "workflow_agent_runtime_review"
};
var PROMPT_NAME_LIST = [
  PROMPT_NAMES.CONTEXT_REWRITE,
  PROMPT_NAMES.SEARCH_THEN_INSERT,
  PROMPT_NAMES.AGENT_RUNTIME_REVIEW
];

// src/prompts/agentRuntimeReview.ts
function registerAgentRuntimeReviewPrompt(server) {
  server.registerPrompt(
    PROMPT_NAMES.AGENT_RUNTIME_REVIEW,
    {
      title: "Agent Runtime Review",
      description: "Generate a focused runtime and MCP contract review request for an agent",
      argsSchema: {
        scope: z.string().min(1).describe("Review scope, file set, or capability area"),
        severityThreshold: z.enum(["high", "medium", "low"]).default("medium")
      }
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are reviewing an MCP server implementation.",
              `Scope: ${args.scope}`,
              `Report findings with severity >= ${args.severityThreshold}.`,
              "Focus areas:",
              "1) Tool contract quality (naming, schema strictness, annotations)",
              "2) Runtime behavior (startup handshake, degraded reasons, fallback consistency)",
              "3) Semantic indexing readiness and result interpretation",
              "4) Resource and prompt consistency with the tool surface",
              "Use read-only checks first, include concrete file/line references, and suggest minimal patches."
            ].join("\n")
          }
        }
      ]
    })
  );
}

// src/prompts/contextRewrite.ts
import { z as z2 } from "zod";

// src/constants/toolNames.ts
var TOOL_NAMES = {
  SEARCH_NOTES: "search_notes",
  SEMANTIC_SEARCH_NOTES: "semantic_search_notes",
  REFRESH_SEMANTIC_INDEX: "refresh_semantic_index",
  READ_NOTE: "read_note",
  READ_ACTIVE_CONTEXT: "read_active_context",
  EDIT_NOTE: "edit_note",
  LIST_NOTES: "list_notes",
  MOVE_NOTE: "move_note",
  GET_SEMANTIC_INDEX_STATUS: "get_semantic_index_status",
  CREATE_NOTE: "create_note",
  DELETE_NOTE: "delete_note",
  PATCH_NOTE_METADATA: "patch_note_metadata"
};
var TOOL_NAME_LIST = [
  TOOL_NAMES.SEARCH_NOTES,
  TOOL_NAMES.SEMANTIC_SEARCH_NOTES,
  TOOL_NAMES.REFRESH_SEMANTIC_INDEX,
  TOOL_NAMES.READ_NOTE,
  TOOL_NAMES.READ_ACTIVE_CONTEXT,
  TOOL_NAMES.EDIT_NOTE,
  TOOL_NAMES.LIST_NOTES,
  TOOL_NAMES.MOVE_NOTE,
  TOOL_NAMES.GET_SEMANTIC_INDEX_STATUS,
  TOOL_NAMES.CREATE_NOTE,
  TOOL_NAMES.DELETE_NOTE,
  TOOL_NAMES.PATCH_NOTE_METADATA
];

// src/prompts/contextRewrite.ts
function registerContextRewritePrompt(server) {
  server.registerPrompt(
    PROMPT_NAMES.CONTEXT_REWRITE,
    {
      title: "Context-aware Rewrite",
      description: "Rewrite currently selected text while preserving local context",
      argsSchema: {
        style: z2.string().min(1).optional()
      }
    },
    (args) => {
      const style = typeof args.style === "string" && args.style.trim().length > 0 ? args.style : "keep original tone";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Use ${TOOL_NAMES.READ_ACTIVE_CONTEXT} to retrieve current selection and surrounding context.`,
                `Pass the returned selection edit target into ${TOOL_NAMES.EDIT_NOTE} and rewrite only that text.`,
                `Preferred style: ${style}.`
              ].join("\n")
            }
          }
        ]
      };
    }
  );
}

// src/prompts/searchThenInsert.ts
import { z as z3 } from "zod";
function registerSearchThenInsertPrompt(server) {
  server.registerPrompt(
    PROMPT_NAMES.SEARCH_THEN_INSERT,
    {
      title: "Search Then Insert",
      description: "Find relevant context semantically and apply a concise edit to the active note",
      argsSchema: {
        query: z3.string().min(1)
      }
    },
    (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Run ${TOOL_NAMES.SEMANTIC_SEARCH_NOTES} with query: ${args.query}`,
              "Summarize the highest-ranked result in one sentence.",
              `Read the active buffer with ${TOOL_NAMES.READ_ACTIVE_CONTEXT}, then apply the summary to a relevant active target via ${TOOL_NAMES.EDIT_NOTE}.`
            ].join("\n")
          }
        }
      ]
    })
  );
}

// src/constants/resourceUris.ts
var RESOURCE_URIS = {
  CAPABILITY_MATRIX: "capability://matrix",
  SCHEMA_SUMMARY: "schema://tool-inputs",
  FALLBACK_BEHAVIOR: "fallback://behavior",
  ACTIVE_EDITOR_CONTEXT: "context://active-editor",
  RUNTIME_STATUS: "runtime://status",
  REVIEW_CHECKLIST: "review://checklist"
};
var RESOURCE_URI_LIST = [
  RESOURCE_URIS.CAPABILITY_MATRIX,
  RESOURCE_URIS.SCHEMA_SUMMARY,
  RESOURCE_URIS.FALLBACK_BEHAVIOR,
  RESOURCE_URIS.ACTIVE_EDITOR_CONTEXT,
  RESOURCE_URIS.RUNTIME_STATUS,
  RESOURCE_URIS.REVIEW_CHECKLIST
];

// src/resources/activeEditorContext.ts
function registerActiveEditorContextResource(server, editorService) {
  server.registerResource(
    "active_editor_context",
    RESOURCE_URIS.ACTIVE_EDITOR_CONTEXT,
    {
      title: "Active Editor Context",
      description: "Read-only snapshot of active editor state",
      mimeType: "application/json"
    },
    async (uri) => {
      const result = await editorService.getContext();
      const normalizedContext = {
        activeFile: typeof result.context.activeFile === "string" ? result.context.activeFile : null,
        cursor: result.context.cursor ?? null,
        selection: typeof result.context.selection === "string" ? result.context.selection : "",
        selectionRange: result.context.selectionRange ?? null,
        content: typeof result.context.content === "string" ? result.context.content : ""
      };
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                ...normalizedContext,
                degraded: result.degraded,
                degradedReason: result.degradedReason,
                noActiveEditor: result.noActiveEditor,
                editorState: result.noActiveEditor ? "none" : "active"
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}

// src/resources/capabilityMatrix.ts
function registerCapabilityMatrixResource(server) {
  server.registerResource(
    "capability_matrix",
    RESOURCE_URIS.CAPABILITY_MATRIX,
    {
      title: "Capability Matrix",
      description: "Tool/Resource/Prompt classification matrix",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              tools: TOOL_NAME_LIST,
              resources: RESOURCE_URI_LIST,
              prompts: PROMPT_NAME_LIST
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/resources/fallbackBehavior.ts
function registerFallbackBehaviorResource(server) {
  server.registerResource(
    "fallback_behavior",
    RESOURCE_URIS.FALLBACK_BEHAVIOR,
    {
      title: "Fallback Behavior",
      description: "Describes degraded-mode behavior when plugin is unavailable",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              degradedMode: {
                triggers: ["plugin-unreachable", "compatibility-failed"],
                noteOperations: "vault file-backed fallback",
                metadataOperations: "vault file-backed fallback",
                semanticSearch: "unavailable",
                requiredEnv: ["OBSIDIAN_VAULT_PATH"]
              }
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/resources/reviewChecklist.ts
function registerReviewChecklistResource(server) {
  server.registerResource(
    "review_checklist",
    RESOURCE_URIS.REVIEW_CHECKLIST,
    {
      title: "Agent Review Checklist",
      description: "Read-only checklist for runtime and MCP contract review",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              checklist: [
                "Tool names and descriptions are intent-first and unambiguous",
                "Input schemas are strict z.object with bounded fields",
                "Dangerous operations use destructiveHint and narrow input",
                "Responses include structuredContent and actionable degradedReason",
                "Runtime status and fallback behavior are observable via resources",
                "Prompt guidance references current tool names and expected outputs"
              ]
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/resources/runtimeStatus.ts
function registerRuntimeStatusResource(server, pluginClient) {
  server.registerResource(
    "runtime_status",
    RESOURCE_URIS.RUNTIME_STATUS,
    {
      title: "Runtime Status",
      description: "MCP runtime availability, retries, and degraded reason",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(pluginClient.getRuntimeStatus(), null, 2)
        }
      ]
    })
  );
}

// src/resources/schemaSummary.ts
function registerSchemaSummaryResource(server) {
  server.registerResource(
    "schema_summary",
    RESOURCE_URIS.SCHEMA_SUMMARY,
    {
      title: "Tool Input Schemas",
      description: "Summary of strict input schema policy for mcp tools",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            {
              policy: {
                requiresZodObject: true,
                requiresOutputSchema: true,
                requiresEnumForFiniteValues: true,
                requiresBoundedLimit: true,
                disallowAny: true,
                prefersReadToEditHandoff: true
              }
            },
            null,
            2
          )
        }
      ]
    })
  );
}

// src/domain/toolResult.ts
function humanizeValidationMessage(message) {
  if (message.includes("must be equal to constant") || message.includes("Invalid discriminator value")) {
    return `${message} Supported edit change.type values are replaceTarget, append, prepend, insertAtCursor, and replaceText.`;
  }
  if (message.includes("occurrence")) {
    return `${message} Use "first", "last", "all", or a positive number such as 1.`;
  }
  if (message.includes("must be an object or a JSON string representing one")) {
    return `${message} Pass the structured target/change object returned by read_note or read_active_context.`;
  }
  return message;
}
function buildStructuredPreview(structuredContent) {
  if (structuredContent === null || structuredContent === void 0) {
    return null;
  }
  switch (typeof structuredContent) {
    case "string":
      return structuredContent;
    case "number":
    case "boolean":
      return JSON.stringify(structuredContent);
    case "bigint":
      return structuredContent.toString();
    case "function":
    case "symbol":
      return null;
    default:
      break;
  }
  const serialized = JSON.stringify(
    structuredContent,
    (_key, value) => typeof value === "bigint" ? value.toString() : value,
    2
  );
  if (!serialized) {
    return null;
  }
  return truncateText(serialized, TOOL_TEXT_MAX_CHARS).text;
}
function okResult(summary, structuredContent, detailText) {
  const preview = detailText ?? buildStructuredPreview(structuredContent);
  const text = truncateText(
    preview ? `${summary}

${preview}` : summary,
    TOOL_TEXT_MAX_CHARS
  ).text;
  return {
    content: [{ type: "text", text }],
    structuredContent
  };
}
function errorResult(error) {
  const message = error.code === "VALIDATION" ? humanizeValidationMessage(error.message) : error.message;
  const payload = {
    isError: true,
    code: error.code,
    message,
    correlationId: error.correlationId
  };
  return {
    isError: true,
    code: error.code,
    message,
    correlationId: error.correlationId,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: {
      code: error.code,
      message,
      correlationId: error.correlationId
    }
  };
}

// src/schemas/toolContracts.ts
import { z as z5 } from "zod";

// src/schemas/common.ts
import { z as z4 } from "zod";
var notePathSchema = z4.string().min(1).refine((value) => {
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.startsWith("../") && normalized !== "..";
}, "Path must be vault-relative").describe("Vault-relative markdown note path");
var limitSchema = z4.number().int().min(1).max(50).default(10);
var positionSchema = z4.object({
  line: z4.number().int().min(0),
  ch: z4.number().int().min(0)
});
var rangeSchema = z4.object({
  from: positionSchema,
  to: positionSchema
});

// src/schemas/toolContracts.ts
var isoDateSchema = z5.string().datetime({ offset: true });
var headingPathSchema = z5.array(z5.string().min(1)).min(1).max(16);
function jsonStringOr(schema, fieldName) {
  return z5.union([schema, z5.string().min(1)]).transform((value, ctx) => {
    if (typeof value !== "string") {
      return value;
    }
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      ctx.addIssue({
        code: z5.ZodIssueCode.custom,
        message: `${fieldName} must be an object or a JSON string representing one`
      });
      return z5.NEVER;
    }
    const normalized = schema.safeParse(parsed);
    if (!normalized.success) {
      for (const issue of normalized.error.issues) {
        ctx.addIssue(issue);
      }
      return z5.NEVER;
    }
    return normalized.data;
  }).pipe(schema);
}
var noteAnchorSchema = z5.discriminatedUnion("type", [
  z5.object({ type: z5.literal("full") }),
  z5.object({
    type: z5.literal("frontmatter"),
    startLine: z5.number().int().min(0).optional(),
    endLine: z5.number().int().min(0).optional()
  }),
  z5.object({
    type: z5.literal("heading"),
    headingPath: headingPathSchema,
    startLine: z5.number().int().min(0).optional(),
    endLine: z5.number().int().min(0).optional()
  }),
  z5.object({
    type: z5.literal("block"),
    blockId: z5.string().min(1),
    startLine: z5.number().int().min(0).optional(),
    endLine: z5.number().int().min(0).optional()
  }),
  z5.object({
    type: z5.literal("line"),
    startLine: z5.number().int().min(0),
    endLine: z5.number().int().min(0)
  })
]);
var activeAnchorSchema = z5.discriminatedUnion("type", [
  z5.object({ type: z5.literal("full") }),
  z5.object({
    type: z5.literal("selection"),
    range: rangeSchema
  }),
  z5.object({
    type: z5.literal("range"),
    range: rangeSchema
  }),
  z5.object({
    type: z5.literal("cursor"),
    position: positionSchema
  })
]);
var noteEditTargetSchema = z5.object({
  source: z5.literal("note"),
  note: notePathSchema.describe("Vault-relative note path"),
  anchor: noteAnchorSchema.describe(
    'Target within the note. Use {"type":"full"} for whole-note edits.'
  ),
  revision: z5.string().nullable(),
  currentText: z5.string().optional()
});
var activeEditTargetSchema = z5.object({
  source: z5.literal("active"),
  activeFile: z5.string().nullable(),
  anchor: activeAnchorSchema.describe(
    "Active editor target. Use selection, cursor, range, or full document anchors returned by read_active_context."
  ),
  revision: z5.null(),
  currentText: z5.string().optional()
});
var editTargetSchema = z5.discriminatedUnion("source", [
  noteEditTargetSchema,
  activeEditTargetSchema
]);
var editChangeSchema = z5.discriminatedUnion("type", [
  z5.object({
    type: z5.literal("replaceTarget"),
    content: z5.string().describe("Replace the entire resolved target with this content.")
  }),
  z5.object({
    type: z5.literal("append"),
    content: z5.string().describe("Append this content to the resolved target.")
  }),
  z5.object({
    type: z5.literal("prepend"),
    content: z5.string().describe("Prepend this content to the resolved target.")
  }),
  z5.object({
    type: z5.literal("insertAtCursor"),
    content: z5.string().describe("Insert this content at an active editor cursor target.")
  }),
  z5.object({
    type: z5.literal("replaceText"),
    find: z5.string().min(1).describe("Exact text to find inside the resolved target."),
    replace: z5.string().describe("Replacement text."),
    occurrence: z5.union([z5.literal("first"), z5.literal("last"), z5.literal("all"), z5.number().int().min(1)]).describe('Which match to replace. Use "first", "last", "all", or a positive number like 1.')
  })
]);
var readNoteInputSchema = z5.object({
  note: notePathSchema,
  anchor: jsonStringOr(noteAnchorSchema, "anchor").optional().default({ type: "full" }),
  maxChars: z5.number().int().min(200).max(1e5).optional().default(5e4),
  include: z5.object({
    metadata: z5.boolean().optional().default(true),
    documentMap: z5.boolean().optional().default(false)
  }).optional().default({ metadata: true, documentMap: false })
});
var readActiveContextInputSchema = z5.object({
  maxChars: z5.number().int().min(200).max(1e5).optional().default(5e4)
});
var editNoteInputSchema = z5.object({
  target: jsonStringOr(editTargetSchema, "target").describe(
    "Edit target returned by read_note.editTarget, read_note.documentEditTarget, or read_active_context.editTargets.*"
  ),
  change: jsonStringOr(editChangeSchema, "change").describe(
    "Edit operation. Supported types: replaceTarget, append, prepend, insertAtCursor, replaceText."
  )
});
var createNoteInputSchema = z5.object({
  path: notePathSchema,
  content: z5.string()
});
var patchNoteMetadataInputSchema = z5.object({
  note: notePathSchema,
  metadata: z5.record(z5.unknown())
});
var moveNoteInputSchema = z5.object({
  from: notePathSchema,
  to: notePathSchema
});
var deleteNoteInputSchema = z5.object({
  note: notePathSchema
});
var listNotesInputSchema = z5.object({
  path: z5.string().optional().default("").describe("Vault-relative directory path. Empty string means vault root."),
  cursor: z5.string().optional(),
  limit: z5.number().int().min(1).max(200).optional().default(100),
  recursive: z5.boolean().optional().default(false),
  includeDirs: z5.boolean().optional().default(true)
});
var frontmatterEqualsFilterSchema = z5.object({
  key: z5.string().min(1),
  value: z5.union([z5.string(), z5.number(), z5.boolean()])
});
var lexicalSearchInputSchema = z5.object({
  query: z5.string().trim().optional(),
  pathPrefix: z5.string().optional(),
  filters: z5.object({
    tagsAny: z5.array(z5.string().min(1)).optional(),
    tagsAll: z5.array(z5.string().min(1)).optional(),
    frontmatterEquals: z5.array(frontmatterEqualsFilterSchema).optional(),
    modifiedAfter: isoDateSchema.optional(),
    modifiedBefore: isoDateSchema.optional(),
    filenameGlob: z5.string().optional()
  }).optional(),
  sort: z5.enum(["relevance", "modifiedDesc", "modifiedAsc", "pathAsc"]).optional().default("relevance"),
  limit: limitSchema.optional().default(10),
  cursor: z5.string().optional(),
  include: z5.object({
    snippet: z5.boolean().optional().default(true),
    matchLocations: z5.boolean().optional().default(true),
    tags: z5.boolean().optional().default(false),
    frontmatterKeys: z5.array(z5.string().min(1)).optional().default([])
  }).optional().default({ snippet: true, matchLocations: true, tags: false, frontmatterKeys: [] })
});
var semanticSearchInputSchema = z5.object({
  query: z5.string().min(1),
  pathPrefix: z5.string().optional(),
  filters: z5.object({
    tagsAny: z5.array(z5.string().min(1)).optional(),
    tagsAll: z5.array(z5.string().min(1)).optional(),
    modifiedAfter: isoDateSchema.optional(),
    modifiedBefore: isoDateSchema.optional(),
    notePaths: z5.array(notePathSchema).optional()
  }).optional(),
  topK: z5.number().int().min(1).max(20).optional().default(8),
  maxPerNote: z5.number().int().min(1).max(5).optional().default(2),
  minScore: z5.number().min(-1).max(1).optional(),
  include: z5.object({
    tags: z5.boolean().optional().default(false),
    frontmatterKeys: z5.array(z5.string().min(1)).optional().default([]),
    neighboringLines: z5.number().int().min(0).max(5).optional().default(0)
  }).optional().default({ tags: false, frontmatterKeys: [], neighboringLines: 0 })
});
var semanticIndexStatusInputSchema = z5.object({
  pendingSampleLimit: z5.number().int().min(1).max(50).optional().default(20)
});
var refreshSemanticIndexInputSchema = z5.object({});
var noteSummarySchema = z5.object({
  path: notePathSchema,
  title: z5.string(),
  modifiedAt: isoDateSchema,
  size: z5.number().int().min(0).optional()
});
var noteSelectionSchema = z5.object({
  anchor: z5.object({
    type: z5.enum(["full", "frontmatter", "heading", "block", "line"]),
    headingPath: headingPathSchema.optional(),
    blockId: z5.string().optional(),
    startLine: z5.number().int().min(0).optional(),
    endLine: z5.number().int().min(0).optional()
  }),
  totalLines: z5.number().int().min(0)
});
var readNoteOutputSchema = z5.object({
  note: noteSummarySchema,
  revision: z5.string(),
  selection: noteSelectionSchema,
  content: z5.object({
    text: z5.string(),
    truncated: z5.boolean(),
    charsReturned: z5.number().int().min(0)
  }),
  metadata: z5.object({
    tags: z5.array(z5.string()),
    frontmatter: z5.record(z5.unknown())
  }).nullable(),
  metadataTruncated: z5.boolean().optional(),
  documentMap: z5.object({
    headings: z5.array(
      z5.object({
        path: z5.array(z5.string()),
        level: z5.number().int().min(1),
        startLine: z5.number().int().min(0),
        endLine: z5.number().int().min(0)
      })
    ),
    blocks: z5.array(
      z5.object({
        blockId: z5.string(),
        startLine: z5.number().int().min(0),
        endLine: z5.number().int().min(0)
      })
    ),
    frontmatterFields: z5.array(z5.string())
  }).nullable(),
  documentMapTruncated: z5.boolean().optional(),
  readMoreHint: z5.object({
    note: notePathSchema,
    anchor: noteAnchorSchema,
    maxChars: z5.number().int().min(200).max(1e5),
    reason: z5.enum(["line_window", "full_continuation", "expand_same_anchor"]),
    returnedCompleteLines: z5.number().int().min(0)
  }).nullable(),
  editTarget: noteEditTargetSchema,
  documentEditTarget: noteEditTargetSchema,
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable()
});
var readActiveContextOutputSchema = z5.object({
  activeFile: z5.string().nullable(),
  cursor: positionSchema.nullable(),
  selection: z5.string(),
  selectionTruncated: z5.boolean(),
  selectionCharsReturned: z5.number().int().min(0),
  selectionTotalChars: z5.number().int().min(0),
  selectionRange: rangeSchema.nullable(),
  content: z5.string(),
  contentTruncated: z5.boolean(),
  contentCharsReturned: z5.number().int().min(0),
  contentTotalChars: z5.number().int().min(0),
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable(),
  noActiveEditor: z5.boolean(),
  editorState: z5.enum(["active", "none"]),
  editTargets: z5.object({
    selection: activeEditTargetSchema.optional(),
    cursor: activeEditTargetSchema.optional(),
    document: activeEditTargetSchema.optional()
  }).nullable()
});
var editNoteOutputSchema = z5.object({
  status: z5.enum(["applied", "noOp"]),
  target: z5.object({
    source: z5.enum(["note", "active"]),
    note: notePathSchema.optional(),
    activeFile: z5.string().nullable().optional(),
    anchor: z5.object({
      type: z5.enum([
        "full",
        "frontmatter",
        "heading",
        "block",
        "line",
        "selection",
        "range",
        "cursor"
      ]),
      headingPath: headingPathSchema.optional(),
      blockId: z5.string().optional(),
      startLine: z5.number().int().min(0).optional(),
      endLine: z5.number().int().min(0).optional(),
      range: rangeSchema.optional(),
      position: positionSchema.optional()
    })
  }),
  revisionBefore: z5.string().nullable(),
  revisionAfter: z5.string().nullable(),
  preview: z5.object({
    before: z5.string(),
    after: z5.string(),
    contextBefore: z5.string().optional(),
    contextAfter: z5.string().optional()
  }),
  previewMeta: z5.object({
    beforeTotalChars: z5.number().int().min(0),
    afterTotalChars: z5.number().int().min(0),
    beforeTruncated: z5.boolean(),
    afterTruncated: z5.boolean(),
    changedBeforeTotalChars: z5.number().int().min(0),
    changedAfterTotalChars: z5.number().int().min(0),
    contextBeforeTotalChars: z5.number().int().min(0),
    contextAfterTotalChars: z5.number().int().min(0),
    changedBeforeTruncated: z5.boolean(),
    changedAfterTruncated: z5.boolean(),
    contextBeforeTruncated: z5.boolean(),
    contextAfterTruncated: z5.boolean()
  }).optional(),
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable(),
  readBack: z5.object({
    tool: z5.enum(["read_note", "read_active_context"]),
    input: z5.record(z5.unknown())
  }),
  warnings: z5.array(z5.string())
});
var listNotesOutputSchema = z5.object({
  path: z5.string(),
  returned: z5.number().int().min(0),
  hasMore: z5.boolean(),
  nextCursor: z5.string().nullable(),
  entries: z5.array(
    z5.object({
      path: z5.string(),
      name: z5.string(),
      kind: z5.enum(["file", "directory"]),
      updatedAt: isoDateSchema,
      size: z5.number().int().min(0)
    })
  ),
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable()
});
var searchNotesOutputSchema = z5.object({
  query: z5.string().nullable(),
  sort: z5.enum(["relevance", "modifiedDesc", "modifiedAsc", "pathAsc"]),
  totalMatches: z5.number().int().min(0),
  returned: z5.number().int().min(0),
  hasMore: z5.boolean(),
  nextCursor: z5.string().nullable(),
  results: z5.array(
    z5.object({
      note: noteSummarySchema.omit({ size: true }),
      score: z5.number(),
      matchedFields: z5.array(z5.enum(["path", "text", "frontmatter", "tags"])),
      bestAnchor: z5.object({
        type: z5.literal("line"),
        startLine: z5.number().int().min(0),
        endLine: z5.number().int().min(0),
        headingPath: headingPathSchema.optional()
      }).nullable(),
      snippet: z5.object({
        text: z5.string(),
        startLine: z5.number().int().min(0),
        endLine: z5.number().int().min(0)
      }).nullable(),
      metadata: z5.object({
        tags: z5.array(z5.string()).optional(),
        frontmatter: z5.record(z5.unknown()).optional()
      }).nullable(),
      readHint: z5.object({
        note: notePathSchema,
        anchor: noteAnchorSchema
      })
    })
  )
});
var semanticIndexStatusOutputSchema = z5.object({
  pendingCount: z5.number().int().min(0),
  indexedNoteCount: z5.number().int().min(0),
  indexedChunkCount: z5.number().int().min(0),
  running: z5.boolean(),
  ready: z5.boolean(),
  isEmpty: z5.boolean(),
  modelReady: z5.boolean(),
  pendingSample: z5.array(z5.string()),
  scannedCount: z5.number().int().min(0),
  skippedCount: z5.number().int().min(0),
  queuedCount: z5.number().int().min(0),
  flushedCount: z5.number().int().min(0),
  removedCount: z5.number().int().min(0)
});
var semanticSearchOutputSchema = z5.object({
  query: z5.string(),
  returned: z5.number().int().min(0),
  indexStatus: semanticIndexStatusOutputSchema,
  results: z5.array(
    z5.object({
      rank: z5.number().int().min(1),
      score: z5.number(),
      note: noteSummarySchema.omit({ size: true }),
      anchor: z5.object({
        type: z5.literal("line"),
        startLine: z5.number().int().min(0),
        endLine: z5.number().int().min(0),
        headingPath: headingPathSchema.nullable()
      }),
      chunk: z5.object({
        id: z5.string(),
        text: z5.string(),
        startLine: z5.number().int().min(0),
        endLine: z5.number().int().min(0)
      }),
      metadata: z5.object({
        tags: z5.array(z5.string()).optional(),
        frontmatter: z5.record(z5.unknown()).optional()
      }).nullable(),
      readHint: z5.object({
        note: notePathSchema,
        anchor: noteAnchorSchema
      })
    })
  )
});
var createNoteOutputSchema = z5.object({
  note: z5.object({ path: notePathSchema }),
  created: z5.boolean(),
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable()
});
var patchNoteMetadataOutputSchema = z5.object({
  note: z5.object({ path: notePathSchema }),
  metadata: z5.record(z5.unknown()),
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable()
});
var moveNoteOutputSchema = z5.object({
  from: notePathSchema,
  to: notePathSchema,
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable()
});
var deleteNoteOutputSchema = z5.object({
  note: z5.object({ path: notePathSchema }),
  deleted: z5.boolean(),
  degraded: z5.boolean(),
  degradedReason: z5.string().nullable()
});
var refreshSemanticIndexOutputSchema = z5.object({
  totalFound: z5.number().int().min(0),
  scannedCount: z5.number().int().min(0),
  skippedCount: z5.number().int().min(0),
  queuedCount: z5.number().int().min(0),
  flushedCount: z5.number().int().min(0),
  removedCount: z5.number().int().min(0),
  pendingCount: z5.number().int().min(0),
  indexedNoteCount: z5.number().int().min(0),
  indexedChunkCount: z5.number().int().min(0),
  modelReady: z5.boolean()
});

// src/tools/noteManagement.ts
function toIsoDate(value) {
  return new Date(value).toISOString();
}
function registerNoteTools(server, noteService) {
  server.registerTool(
    TOOL_NAMES.REFRESH_SEMANTIC_INDEX,
    {
      description: "Build or rebuild the semantic index. This operation can take time on large vaults.",
      inputSchema: refreshSemanticIndexInputSchema,
      outputSchema: refreshSemanticIndexOutputSchema
    },
    async () => {
      try {
        const result = await noteService.refreshIndex();
        return okResult(
          `Semantic indexing refresh completed (${result.pendingCount === 0 ? "ready" : "pending"})`,
          result,
          [
            `totalFound=${result.totalFound}`,
            `scanned=${result.scannedCount}`,
            `skipped=${result.skippedCount}`,
            `queued=${result.queuedCount}`,
            `flushed=${result.flushedCount}`,
            `removed=${result.removedCount}`,
            `pending=${result.pendingCount}`,
            `indexedNotes=${result.indexedNoteCount}`,
            `indexedChunks=${result.indexedChunkCount}`,
            `modelReady=${result.modelReady}`
          ].join("\n")
        );
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "refresh index failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.CREATE_NOTE,
    {
      description: "Create a markdown note at a vault-relative path.",
      inputSchema: createNoteInputSchema,
      outputSchema: createNoteOutputSchema
    },
    async (params) => {
      try {
        const result = await noteService.write(params.path, params.content);
        return okResult(`Created note (${result.degraded ? "degraded" : "normal"})`, {
          note: { path: result.path },
          created: true,
          degraded: result.degraded,
          degradedReason: result.degradedReason
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "create note failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.LIST_NOTES,
    {
      description: "List notes and directories under a vault-relative folder with bounded pagination.",
      inputSchema: listNotesInputSchema,
      outputSchema: listNotesOutputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    (params) => {
      try {
        const result = noteService.list(params.path, {
          cursor: params.cursor,
          limit: params.limit,
          recursive: params.recursive,
          includeDirs: params.includeDirs
        });
        return okResult(`Listed ${result.entries.length} entries`, {
          path: result.path,
          returned: result.entries.length,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          entries: result.entries.map((entry) => ({
            ...entry,
            updatedAt: toIsoDate(entry.updatedAt)
          })),
          degraded: result.degraded,
          degradedReason: result.degradedReason
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "list notes failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.MOVE_NOTE,
    {
      description: "Move or rename a note within the vault root.",
      inputSchema: moveNoteInputSchema,
      outputSchema: moveNoteOutputSchema
    },
    async (params) => {
      try {
        const result = await noteService.move(params.from, params.to);
        return okResult(`Moved note (${result.degraded ? "degraded" : "normal"})`, result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "move note failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.PATCH_NOTE_METADATA,
    {
      description: "Patch note frontmatter without editing markdown body content.",
      inputSchema: patchNoteMetadataInputSchema,
      outputSchema: patchNoteMetadataOutputSchema,
      annotations: {
        idempotentHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.updateMetadata(params.note, params.metadata);
        return okResult(`Patched metadata (${result.degraded ? "degraded" : "normal"})`, {
          note: { path: result.path },
          metadata: result.metadata,
          degraded: result.degraded,
          degradedReason: result.degradedReason
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "patch metadata failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.DELETE_NOTE,
    {
      description: "Delete a note by vault-relative path.",
      inputSchema: deleteNoteInputSchema,
      outputSchema: deleteNoteOutputSchema,
      annotations: {
        destructiveHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.delete(params.note);
        return okResult(`Deleted note (${result.degraded ? "degraded" : "normal"})`, {
          note: { path: params.note },
          deleted: result.deleted,
          degraded: result.degraded,
          degradedReason: result.degradedReason
        });
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "delete failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.GET_SEMANTIC_INDEX_STATUS,
    {
      description: "Inspect semantic index readiness, queue depth, and a bounded sample of pending note paths.",
      inputSchema: semanticIndexStatusInputSchema,
      outputSchema: semanticIndexStatusOutputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    (params) => {
      try {
        const result = noteService.getIndexStatus(params.pendingSampleLimit);
        return okResult("Retrieved semantic index status", result);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "get semantic index status failed");
        return errorResult(domainError);
      }
    }
  );
}

// src/tools/readEdit.ts
function toIsoDate2(value) {
  return new Date(value).toISOString();
}
function extractTags(metadata) {
  const rawTags = metadata.tags;
  if (Array.isArray(rawTags)) {
    return rawTags.filter((value) => typeof value === "string");
  }
  if (typeof rawTags === "string" && rawTags.trim().length > 0) {
    return [rawTags];
  }
  return [];
}
function toMutationSummary(status, degraded) {
  const mode = degraded ? "degraded" : "normal";
  return status === "noOp" ? `No edit applied (${mode})` : `Edit applied (${mode})`;
}
function anchorToText(anchor) {
  switch (anchor.type) {
    case "heading":
      return `heading:${anchor.headingPath?.join(" > ") ?? ""}`;
    case "block":
      return `block:${anchor.blockId ?? ""}`;
    case "line":
      return `line:${anchor.startLine ?? 0}-${anchor.endLine ?? 0}`;
    case "frontmatter":
      return "frontmatter";
    case "full":
      return "full";
    default:
      return anchor.type;
  }
}
function previewText(text, maxChars = 240) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return truncateText(normalized, maxChars).text;
}
function boundTags(tags) {
  const bounded = tags.slice(0, RESPONSE_ARRAY_MAX_ITEMS).map((tag) => truncateText(tag, RESPONSE_EXCERPT_MAX_CHARS));
  return {
    tags: bounded.map((tag) => tag.text),
    truncated: tags.length > RESPONSE_ARRAY_MAX_ITEMS || bounded.some((tag) => tag.truncated)
  };
}
function boundFrontmatter(frontmatter) {
  const bounded = boundStructuredValue(frontmatter);
  return {
    frontmatter: bounded.value && typeof bounded.value === "object" && !Array.isArray(bounded.value) ? bounded.value : {},
    truncated: bounded.truncated
  };
}
function boundDocumentMap(documentMap) {
  if (!documentMap) {
    return { documentMap: null, truncated: false };
  }
  const headings = documentMap.headings.slice(0, 100);
  const blocks = documentMap.blocks.slice(0, 100);
  const frontmatterFields = documentMap.frontmatterFields.slice(0, 50);
  return {
    documentMap: {
      headings,
      blocks,
      frontmatterFields
    },
    truncated: documentMap.headings.length > headings.length || documentMap.blocks.length > blocks.length || documentMap.frontmatterFields.length > frontmatterFields.length
  };
}
function buildMutationPreview(beforeText, afterText) {
  const beforeLines = beforeText.split("\n");
  const afterLines = afterText.split("\n");
  const sharedPrefixLines = Math.min(beforeLines.length, afterLines.length);
  let prefix = 0;
  while (prefix < sharedPrefixLines && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (suffix < beforeLines.length - prefix && suffix < afterLines.length - prefix && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]) {
    suffix += 1;
  }
  const beforeChangedText = beforeLines.slice(prefix, beforeLines.length - suffix).join("\n");
  const afterChangedText = afterLines.slice(prefix, afterLines.length - suffix).join("\n");
  const contextStart = Math.max(0, prefix - 1);
  const beforeContextEnd = Math.min(beforeLines.length, beforeLines.length - suffix + 1);
  const afterContextEnd = Math.min(afterLines.length, afterLines.length - suffix + 1);
  const beforeContextText = beforeChangedText.length > 0 ? beforeLines.slice(contextStart, beforeContextEnd).join("\n") : beforeText;
  const afterContextText = afterChangedText.length > 0 ? afterLines.slice(contextStart, afterContextEnd).join("\n") : afterText;
  const before = truncateText(beforeChangedText || beforeText, RESPONSE_EXCERPT_MAX_CHARS);
  const after = truncateText(afterChangedText || afterText, RESPONSE_EXCERPT_MAX_CHARS);
  const contextBefore = truncateText(beforeContextText, RESPONSE_EXCERPT_MAX_CHARS);
  const contextAfter = truncateText(afterContextText, RESPONSE_EXCERPT_MAX_CHARS);
  return {
    preview: {
      before: before.text,
      after: after.text,
      contextBefore: contextBefore.text,
      contextAfter: contextAfter.text
    },
    previewMeta: {
      beforeTotalChars: before.totalChars,
      afterTotalChars: after.totalChars,
      beforeTruncated: before.truncated,
      afterTruncated: after.truncated,
      changedBeforeTotalChars: before.totalChars,
      changedAfterTotalChars: after.totalChars,
      contextBeforeTotalChars: contextBefore.totalChars,
      contextAfterTotalChars: contextAfter.totalChars,
      changedBeforeTruncated: before.truncated,
      changedAfterTruncated: after.truncated,
      contextBeforeTruncated: contextBefore.truncated,
      contextAfterTruncated: contextAfter.truncated
    }
  };
}
function countCompleteLines(fullText, returnedText) {
  if (returnedText.length === 0) {
    return 0;
  }
  let completeLines = 0;
  let offset = 0;
  while (offset < fullText.length) {
    const nextNewline = fullText.indexOf("\n", offset);
    if (nextNewline === -1) {
      if (returnedText.length >= fullText.length) {
        completeLines += 1;
      }
      break;
    }
    const lineEndOffset = nextNewline + 1;
    if (returnedText.length < lineEndOffset) {
      break;
    }
    completeLines += 1;
    offset = lineEndOffset;
  }
  return completeLines;
}
function buildReadMoreHint(note, resolved, maxChars, returnedText, contentTruncated) {
  if (resolved.anchor.type === "line") {
    const windowSize = resolved.anchor.endLine - resolved.anchor.startLine + 1;
    const nextStartLine = resolved.anchor.endLine + 1;
    if (nextStartLine > resolved.totalLines - 1) {
      return null;
    }
    return {
      note,
      anchor: {
        type: "line",
        startLine: nextStartLine,
        endLine: Math.min(nextStartLine + windowSize - 1, resolved.totalLines - 1)
      },
      maxChars,
      reason: "line_window",
      returnedCompleteLines: windowSize
    };
  }
  if (!contentTruncated) {
    return null;
  }
  const returnedCompleteLines = countCompleteLines(resolved.text, returnedText);
  if (resolved.anchor.type === "full") {
    const startLine = Math.min(returnedCompleteLines, Math.max(resolved.totalLines - 1, 0));
    if (startLine > resolved.totalLines - 1) {
      return null;
    }
    const windowSize = Math.max(returnedCompleteLines, 1);
    return {
      note,
      anchor: {
        type: "line",
        startLine,
        endLine: Math.min(startLine + windowSize - 1, resolved.totalLines - 1)
      },
      maxChars,
      reason: "full_continuation",
      returnedCompleteLines
    };
  }
  return {
    note,
    anchor: resolved.anchor,
    maxChars: Math.min(maxChars * 2, 1e5),
    reason: "expand_same_anchor",
    returnedCompleteLines
  };
}
function registerReadEditTools(server, noteService, editorService) {
  server.registerTool(
    TOOL_NAMES.READ_NOTE,
    {
      description: "Read part or all of a persisted Obsidian note and return a follow-up edit target.",
      inputSchema: readNoteInputSchema,
      outputSchema: readNoteOutputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (params) => {
      try {
        const result = await noteService.read(params.note);
        const revision = buildRevisionToken(params.note, result.updatedAt, result.size);
        const resolved = resolveNoteSelection(result.content, params.anchor);
        const truncated = truncateText(resolved.text, params.maxChars);
        const boundedTags = boundTags(extractTags(result.metadata));
        const boundedFrontmatter = boundFrontmatter(result.metadata);
        const metadata = params.include.metadata === false ? null : {
          tags: boundedTags.tags,
          frontmatter: boundedFrontmatter.frontmatter
        };
        const boundedDocumentMap = boundDocumentMap(
          params.include.documentMap ? buildDocumentMap(result.content) : null
        );
        const availableTargets = ["editTarget", "documentEditTarget"].join(",");
        const payload = {
          note: {
            path: params.note,
            title: readTitleFromPath(params.note),
            modifiedAt: toIsoDate2(result.updatedAt),
            size: result.size
          },
          revision,
          selection: {
            anchor: resolved.anchor,
            totalLines: resolved.totalLines
          },
          editTarget: {
            source: "note",
            note: params.note,
            anchor: resolved.anchor,
            revision,
            currentText: truncated.truncated ? void 0 : resolved.text
          },
          documentEditTarget: {
            source: "note",
            note: params.note,
            anchor: { type: "full" },
            revision,
            currentText: result.content.length <= params.maxChars ? result.content : void 0
          },
          content: {
            text: truncated.text,
            truncated: truncated.truncated,
            charsReturned: truncated.text.length
          },
          metadata,
          metadataTruncated: params.include.metadata === false ? false : boundedTags.truncated || boundedFrontmatter.truncated,
          documentMap: boundedDocumentMap.documentMap,
          documentMapTruncated: boundedDocumentMap.truncated,
          readMoreHint: buildReadMoreHint(
            params.note,
            resolved,
            params.maxChars,
            truncated.text,
            truncated.truncated
          ),
          degraded: result.degraded,
          degradedReason: result.degradedReason
        };
        const detail = [
          `note=${payload.note.path}`,
          `anchor=${anchorToText(payload.selection.anchor)}`,
          `revision=${payload.revision}`,
          `contentTruncated=${payload.content.truncated}`,
          `metadataTruncated=${payload.metadataTruncated}`,
          `documentMapTruncated=${payload.documentMapTruncated}`,
          `availableTargets=${availableTargets}`,
          `content="${previewText(payload.content.text)}"`
        ].join("\n");
        return okResult(`Read note (${result.degraded ? "degraded" : "normal"})`, payload, detail);
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "read note failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.READ_ACTIVE_CONTEXT,
    {
      description: "Read the active editor buffer and return edit targets for the current active context.",
      inputSchema: readActiveContextInputSchema,
      outputSchema: readActiveContextOutputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (params) => {
      try {
        const result = await editorService.getContext();
        const normalizedContext = {
          activeFile: typeof result.context.activeFile === "string" ? result.context.activeFile : null,
          cursor: result.context.cursor ?? null,
          selection: typeof result.context.selection === "string" ? result.context.selection : "",
          selectionRange: result.context.selectionRange ?? null,
          content: typeof result.context.content === "string" ? result.context.content : ""
        };
        const boundedSelection = truncateText(normalizedContext.selection, params.maxChars);
        const boundedContent = truncateText(normalizedContext.content, params.maxChars);
        const editTargets = result.noActiveEditor ? null : {
          selection: normalizedContext.selection.length > 0 && normalizedContext.selectionRange ? {
            source: "active",
            activeFile: normalizedContext.activeFile,
            anchor: {
              type: "selection",
              range: normalizedContext.selectionRange
            },
            revision: null,
            currentText: boundedSelection.truncated ? void 0 : normalizedContext.selection
          } : void 0,
          cursor: normalizedContext.cursor ? {
            source: "active",
            activeFile: normalizedContext.activeFile,
            anchor: {
              type: "cursor",
              position: normalizedContext.cursor
            },
            revision: null,
            currentText: ""
          } : void 0,
          document: {
            source: "active",
            activeFile: normalizedContext.activeFile,
            anchor: { type: "full" },
            revision: null,
            currentText: boundedContent.truncated ? void 0 : normalizedContext.content
          }
        };
        const payload = {
          ...normalizedContext,
          selection: boundedSelection.text,
          selectionTruncated: boundedSelection.truncated,
          selectionCharsReturned: boundedSelection.text.length,
          selectionTotalChars: normalizedContext.selection.length,
          editTargets,
          content: boundedContent.text,
          contentTruncated: boundedContent.truncated,
          contentCharsReturned: boundedContent.text.length,
          contentTotalChars: normalizedContext.content.length,
          degraded: result.degraded,
          degradedReason: result.degradedReason,
          noActiveEditor: result.noActiveEditor,
          editorState: result.noActiveEditor ? "none" : "active"
        };
        const availableTargets = payload.editTargets ? Object.entries(payload.editTargets).filter(([, value]) => value).map(([key]) => key) : [];
        return okResult(
          result.noActiveEditor ? `No active editor (${result.degraded ? "degraded" : "normal"})` : `Read active context (${result.degraded ? "degraded" : "normal"})`,
          payload,
          [
            `activeFile=${payload.activeFile ?? "null"}`,
            `cursor=${payload.cursor ? `${payload.cursor.line}:${payload.cursor.ch}` : "null"}`,
            `selection="${previewText(payload.selection, 120)}"`,
            `selectionTruncated=${payload.selectionTruncated}`,
            `contentTruncated=${payload.contentTruncated}`,
            `content="${previewText(payload.content, 120)}"`,
            `availableTargets=${availableTargets.join(",") || "none"}`
          ].join("\n")
        );
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "read active context failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.EDIT_NOTE,
    {
      description: 'Edit a persisted note or the active editor using a structured target and change contract. Use the target returned by read_note.editTarget, read_note.documentEditTarget, or read_active_context.editTargets.*. Supported change.type values are replaceTarget, append, prepend, insertAtCursor, and replaceText. For replaceText, occurrence must be "first", "last", "all", or a positive number.',
      inputSchema: editNoteInputSchema,
      outputSchema: editNoteOutputSchema
    },
    async (params) => {
      try {
        if (params.target.source === "note") {
          const current2 = await noteService.read(params.target.note);
          const revisionBefore = buildRevisionToken(
            params.target.note,
            current2.updatedAt,
            current2.size
          );
          compareExpectedRevision(revisionBefore, params.target.revision);
          const resolved2 = resolveNoteSelection(current2.content, params.target.anchor);
          compareExpectedText(resolved2.text, params.target.currentText);
          const changed2 = applyEditChange(resolved2.text, params.change);
          if (changed2.nextText === resolved2.text) {
            const mutationPreview3 = buildMutationPreview(resolved2.text, changed2.nextText);
            const payload3 = {
              status: "noOp",
              target: {
                source: "note",
                note: params.target.note,
                anchor: resolved2.anchor
              },
              revisionBefore,
              revisionAfter: revisionBefore,
              ...mutationPreview3,
              degraded: current2.degraded,
              degradedReason: current2.degradedReason,
              readBack: {
                tool: "read_note",
                input: { note: params.target.note, anchor: resolved2.anchor }
              },
              warnings: changed2.warnings
            };
            return okResult(
              toMutationSummary("noOp", current2.degraded),
              payload3,
              [
                `status=${payload3.status}`,
                `target.note=${payload3.target.note}`,
                `target.anchor=${anchorToText(payload3.target.anchor)}`,
                `changed.before="${previewText(payload3.preview.before)}"`,
                `context.before="${previewText(payload3.preview.contextBefore)}"`,
                `changed.beforeTruncated=${payload3.previewMeta.changedBeforeTruncated}`
              ].join("\n")
            );
          }
          const nextContent = replaceResolvedSelection(current2.content, resolved2, changed2.nextText);
          const writeResult = await noteService.write(params.target.note, nextContent);
          const revisionAfter = buildRevisionToken(
            params.target.note,
            writeResult.updatedAt,
            writeResult.size
          );
          const mutationPreview2 = buildMutationPreview(resolved2.text, changed2.nextText);
          const payload2 = {
            status: "applied",
            target: {
              source: "note",
              note: params.target.note,
              anchor: resolved2.anchor
            },
            revisionBefore,
            revisionAfter,
            ...mutationPreview2,
            degraded: writeResult.degraded,
            degradedReason: writeResult.degradedReason,
            readBack: {
              tool: "read_note",
              input: { note: params.target.note, anchor: resolved2.anchor }
            },
            warnings: changed2.warnings
          };
          return okResult(
            `Edit applied (${writeResult.degraded ? "degraded" : "normal"})`,
            payload2,
            [
              `status=${payload2.status}`,
              `target.note=${payload2.target.note}`,
              `target.anchor=${anchorToText(payload2.target.anchor)}`,
              `changed.before="${previewText(payload2.preview.before)}"`,
              `changed.after="${previewText(payload2.preview.after)}"`,
              `context.before="${previewText(payload2.preview.contextBefore)}"`,
              `context.after="${previewText(payload2.preview.contextAfter)}"`,
              `changed.afterTruncated=${payload2.previewMeta.changedAfterTruncated}`
            ].join("\n")
          );
        }
        const current = await editorService.getContext();
        if (current.noActiveEditor || !current.context.activeFile) {
          throw new DomainError("UNAVAILABLE", "No active editor found");
        }
        if (params.target.activeFile !== null && params.target.activeFile !== current.context.activeFile) {
          throw new DomainError("CONFLICT", "Active editor changed since target was read");
        }
        if (params.target.anchor.type === "cursor") {
          if (params.change.type === "replaceText") {
            throw new DomainError("VALIDATION", "replaceText is not supported for cursor targets");
          }
          const insertedText = params.change.type === "replaceTarget" ? params.change.content : params.change.content;
          const insertResult = await editorService.insertText(
            insertedText,
            params.target.anchor.position
          );
          const mutationPreview2 = buildMutationPreview("", insertedText);
          const payload2 = {
            status: "applied",
            target: {
              source: "active",
              activeFile: insertResult.context.activeFile,
              anchor: params.target.anchor
            },
            revisionBefore: null,
            revisionAfter: null,
            ...mutationPreview2,
            degraded: insertResult.degraded,
            degradedReason: insertResult.degradedReason,
            readBack: {
              tool: "read_active_context",
              input: {}
            },
            warnings: []
          };
          return okResult(
            toMutationSummary("applied", insertResult.degraded),
            payload2,
            [
              `status=${payload2.status}`,
              `target.activeFile=${payload2.target.activeFile ?? "null"}`,
              `target.anchor=${payload2.target.anchor.type}`,
              `changed.after="${previewText(payload2.preview.after)}"`,
              `context.after="${previewText(payload2.preview.contextAfter)}"`,
              `changed.afterTruncated=${payload2.previewMeta.changedAfterTruncated}`
            ].join("\n")
          );
        }
        const resolved = resolveActiveSelection(current.context.content, params.target.anchor);
        compareExpectedText(resolved.text, params.target.currentText);
        const changed = applyEditChange(resolved.text, params.change);
        if (changed.nextText === resolved.text) {
          const mutationPreview2 = buildMutationPreview(resolved.text, changed.nextText);
          const payload2 = {
            status: "noOp",
            target: {
              source: "active",
              activeFile: current.context.activeFile,
              anchor: params.target.anchor
            },
            revisionBefore: null,
            revisionAfter: null,
            ...mutationPreview2,
            degraded: current.degraded,
            degradedReason: current.degradedReason,
            readBack: {
              tool: "read_active_context",
              input: {}
            },
            warnings: changed.warnings
          };
          return okResult(
            toMutationSummary("noOp", current.degraded),
            payload2,
            [
              `status=${payload2.status}`,
              `target.activeFile=${payload2.target.activeFile ?? "null"}`,
              `target.anchor=${payload2.target.anchor.type}`,
              `changed.before="${previewText(payload2.preview.before)}"`,
              `context.before="${previewText(payload2.preview.contextBefore)}"`,
              `changed.beforeTruncated=${payload2.previewMeta.changedBeforeTruncated}`
            ].join("\n")
          );
        }
        if (!resolved.range) {
          throw new DomainError("VALIDATION", "Resolved active target does not include a range");
        }
        const replaceResult = await editorService.replaceRange(changed.nextText, resolved.range);
        const mutationPreview = buildMutationPreview(resolved.text, changed.nextText);
        const payload = {
          status: "applied",
          target: {
            source: "active",
            activeFile: replaceResult.context.activeFile,
            anchor: params.target.anchor
          },
          revisionBefore: null,
          revisionAfter: null,
          ...mutationPreview,
          degraded: replaceResult.degraded,
          degradedReason: replaceResult.degradedReason,
          readBack: {
            tool: "read_active_context",
            input: {}
          },
          warnings: changed.warnings
        };
        return okResult(
          toMutationSummary("applied", replaceResult.degraded),
          payload,
          [
            `status=${payload.status}`,
            `target.activeFile=${payload.target.activeFile ?? "null"}`,
            `target.anchor=${payload.target.anchor.type}`,
            `changed.before="${previewText(payload.preview.before)}"`,
            `changed.after="${previewText(payload.preview.after)}"`,
            `context.before="${previewText(payload.preview.contextBefore)}"`,
            `context.after="${previewText(payload.preview.contextAfter)}"`,
            `changed.afterTruncated=${payload.previewMeta.changedAfterTruncated}`
          ].join("\n")
        );
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "edit failed");
        return errorResult(domainError);
      }
    }
  );
}

// src/tools/searchTools.ts
function toIsoDate3(value) {
  return new Date(value).toISOString();
}
function extractTags2(metadata) {
  const rawTags = metadata.tags;
  if (Array.isArray(rawTags)) {
    return rawTags.filter((value) => typeof value === "string");
  }
  if (typeof rawTags === "string" && rawTags.trim().length > 0) {
    return [rawTags];
  }
  return [];
}
function boundTags2(tags) {
  return tags.slice(0, RESPONSE_ARRAY_MAX_ITEMS).map((tag) => truncateText(tag, RESPONSE_EXCERPT_MAX_CHARS).text);
}
function previewText2(text, maxChars = 120) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return truncateText(normalized, maxChars).text;
}
function buildGlobRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\xA7\xA7DOUBLESTAR\xA7\xA7").replace(/\*/g, "[^/]*").replace(/§§DOUBLESTAR§§/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function matchesFilters(note, filters) {
  if (!filters) {
    return true;
  }
  const tags = extractTags2(note.metadata);
  if (filters.tagsAny && !filters.tagsAny.some((tag) => tags.includes(tag))) {
    return false;
  }
  if (filters.tagsAll && !filters.tagsAll.every((tag) => tags.includes(tag))) {
    return false;
  }
  if (filters.frontmatterEquals && !filters.frontmatterEquals.every(({ key, value }) => note.metadata[key] === value)) {
    return false;
  }
  if (filters.modifiedAfter && note.updatedAt < new Date(filters.modifiedAfter).getTime()) {
    return false;
  }
  if (filters.modifiedBefore && note.updatedAt > new Date(filters.modifiedBefore).getTime()) {
    return false;
  }
  if (filters.filenameGlob && !buildGlobRegex(filters.filenameGlob).test(note.path)) {
    return false;
  }
  return true;
}
function encodeCursor2(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}
function decodeCursor2(cursor) {
  try {
    return Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new DomainError("VALIDATION", "Invalid search cursor");
  }
}
function registerSearchTools(server, _noteService, semanticService) {
  server.registerTool(
    TOOL_NAMES.SEARCH_NOTES,
    {
      description: "Find notes by lexical text matching and metadata filters.",
      inputSchema: lexicalSearchInputSchema,
      outputSchema: searchNotesOutputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    (params) => {
      try {
        if (!params.query?.trim() && !params.filters) {
          throw new DomainError("VALIDATION", "Either query or filters is required");
        }
        const normalizedQuery = params.query?.trim().toLowerCase() ?? "";
        const notes = listNotes().filter((note) => !params.pathPrefix || note.path.startsWith(params.pathPrefix)).map((note) => {
          const metadata = parseFrontmatter(note.content);
          const tags = extractTags2(metadata);
          const matchedFields = [];
          let score = 0;
          if (normalizedQuery) {
            if (note.path.toLowerCase().includes(normalizedQuery)) {
              matchedFields.push("path");
              score += 2;
            }
            if (note.content.toLowerCase().includes(normalizedQuery)) {
              matchedFields.push("text");
              score += 3;
            }
            if (JSON.stringify(metadata).toLowerCase().includes(normalizedQuery)) {
              matchedFields.push("frontmatter");
              score += 1;
            }
            if (tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))) {
              matchedFields.push("tags");
              score += 1;
            }
          }
          return {
            path: note.path,
            title: readTitleFromPath(note.path),
            updatedAt: note.updatedAt,
            score: normalizedQuery ? score : 1,
            matchedFields,
            snippet: normalizedQuery ? findSnippetForQuery(note.content, normalizedQuery) : null,
            metadata
          };
        }).filter((note) => matchesFilters(note, params.filters)).filter((note) => normalizedQuery ? note.score > 0 : true);
        const compareBySort = {
          relevance: (left, right) => right.score - left.score || left.path.localeCompare(right.path, "en"),
          modifiedDesc: (left, right) => right.updatedAt - left.updatedAt || left.path.localeCompare(right.path, "en"),
          modifiedAsc: (left, right) => left.updatedAt - right.updatedAt || left.path.localeCompare(right.path, "en"),
          pathAsc: (left, right) => left.path.localeCompare(right.path, "en")
        }[params.sort];
        notes.sort(compareBySort);
        let startIndex = 0;
        if (params.cursor) {
          const decoded = decodeCursor2(params.cursor);
          const cursorIndex = notes.findIndex((note) => note.path === decoded);
          startIndex = cursorIndex === -1 ? notes.length : cursorIndex + 1;
        }
        const results = notes.slice(startIndex, startIndex + params.limit);
        const hasMore = startIndex + results.length < notes.length;
        const payload = {
          query: params.query ?? null,
          sort: params.sort,
          totalMatches: notes.length,
          returned: results.length,
          hasMore,
          nextCursor: hasMore && results.length > 0 ? encodeCursor2(results[results.length - 1].path) : null,
          results: results.map((result) => {
            const selectedFrontmatter = params.include.frontmatterKeys.length > 0 ? Object.fromEntries(
              params.include.frontmatterKeys.filter((key) => key in result.metadata).map((key) => [key, boundStructuredValue(result.metadata[key]).value])
            ) : void 0;
            return {
              note: {
                path: result.path,
                title: result.title,
                modifiedAt: toIsoDate3(result.updatedAt)
              },
              score: result.score,
              matchedFields: result.matchedFields,
              bestAnchor: result.snippet ? {
                type: "line",
                startLine: result.snippet.startLine,
                endLine: result.snippet.endLine
              } : null,
              snippet: params.include.snippet && result.snippet ? {
                text: result.snippet.text,
                startLine: result.snippet.startLine,
                endLine: result.snippet.endLine
              } : null,
              metadata: params.include.tags || selectedFrontmatter ? {
                ...params.include.tags ? { tags: boundTags2(extractTags2(result.metadata)) } : {},
                ...selectedFrontmatter ? { frontmatter: selectedFrontmatter } : {}
              } : null,
              readHint: {
                note: result.path,
                anchor: result.snippet ? {
                  type: "line",
                  startLine: result.snippet.startLine,
                  endLine: result.snippet.endLine
                } : { type: "full" }
              }
            };
          })
        };
        const detailLines = [
          `returned=${payload.returned} total=${payload.totalMatches} sort=${payload.sort} hasMore=${payload.hasMore}`,
          ...payload.results.slice(0, 10).map((result, index) => {
            const snippet = result.snippet?.text ? previewText2(result.snippet.text) : null;
            const lineHint = result.bestAnchor ? `${result.bestAnchor.startLine}-${result.bestAnchor.endLine}` : "full";
            return `${index + 1}. ${result.note.path} score=${result.score} fields=${result.matchedFields.join(",") || "none"} lines=${lineHint}${snippet ? ` snippet="${snippet}"` : ""}`;
          })
        ];
        return okResult(`Found ${results.length} matching notes`, payload, detailLines.join("\n"));
      } catch (error) {
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "lexical search failed");
        return errorResult(domainError);
      }
    }
  );
  server.registerTool(
    TOOL_NAMES.SEMANTIC_SEARCH_NOTES,
    {
      description: "Find conceptually related note passages using a semantic index.",
      inputSchema: semanticSearchInputSchema,
      outputSchema: semanticSearchOutputSchema,
      annotations: {
        readOnlyHint: true
      }
    },
    async (params) => {
      try {
        const searchResult = await semanticService.searchWithStatus(params.query, {
          topK: params.topK * 5,
          maxPerNote: Math.max(params.maxPerNote, 5),
          minScore: params.minScore,
          pathPrefix: params.pathPrefix,
          notePaths: params.filters?.notePaths
        });
        const perNote = /* @__PURE__ */ new Map();
        const filtered = searchResult.matches.filter((match) => {
          if (params.filters?.modifiedAfter && match.updatedAt < new Date(params.filters.modifiedAfter).getTime()) {
            return false;
          }
          if (params.filters?.modifiedBefore && match.updatedAt > new Date(params.filters.modifiedBefore).getTime()) {
            return false;
          }
          if (!params.filters?.tagsAny && !params.filters?.tagsAll) {
            return true;
          }
          const metadata = readNote(match.path)?.metadata ?? {};
          const tags = extractTags2(metadata);
          if (params.filters.tagsAny && !params.filters.tagsAny.some((tag) => tags.includes(tag))) {
            return false;
          }
          if (params.filters.tagsAll && !params.filters.tagsAll.every((tag) => tags.includes(tag))) {
            return false;
          }
          return true;
        }).filter((match) => {
          const count = perNote.get(match.path) ?? 0;
          if (count >= params.maxPerNote) {
            return false;
          }
          perNote.set(match.path, count + 1);
          return true;
        }).slice(0, params.topK);
        const payload = {
          query: params.query,
          returned: filtered.length,
          indexStatus: searchResult.indexStatus,
          results: filtered.map((match, index) => {
            const metadata = readNote(match.path)?.metadata ?? {};
            const selectedFrontmatter = params.include.frontmatterKeys.length > 0 ? Object.fromEntries(
              params.include.frontmatterKeys.filter((key) => key in metadata).map((key) => [key, boundStructuredValue(metadata[key]).value])
            ) : void 0;
            const noteContent = params.include.neighboringLines > 0 ? readNote(match.path)?.content : null;
            let chunkText = match.text;
            if (noteContent) {
              const lines = noteContent.split("\n");
              const startLine = Math.max(match.startLine - params.include.neighboringLines, 0);
              const endLine = Math.min(
                match.endLine + params.include.neighboringLines,
                lines.length - 1
              );
              chunkText = lines.slice(startLine, endLine + 1).join("\n").trim();
            }
            chunkText = boundSemanticChunkText(chunkText);
            return {
              rank: index + 1,
              score: match.score,
              note: {
                path: match.path,
                title: match.title,
                modifiedAt: toIsoDate3(match.updatedAt)
              },
              anchor: {
                type: "line",
                startLine: match.startLine,
                endLine: match.endLine,
                headingPath: match.headingPath
              },
              chunk: {
                id: match.id,
                text: chunkText,
                startLine: match.startLine,
                endLine: match.endLine
              },
              metadata: params.include.tags || selectedFrontmatter ? {
                ...params.include.tags ? { tags: boundTags2(extractTags2(metadata)) } : {},
                ...selectedFrontmatter ? { frontmatter: selectedFrontmatter } : {}
              } : null,
              readHint: {
                note: match.path,
                anchor: {
                  type: "line",
                  startLine: match.startLine,
                  endLine: match.endLine
                }
              }
            };
          })
        };
        const detailLines = [
          `returned=${payload.returned} indexedNotes=${payload.indexStatus.indexedNoteCount} indexedChunks=${payload.indexStatus.indexedChunkCount} pending=${payload.indexStatus.pendingCount}`,
          ...payload.results.slice(0, 10).map((result) => {
            const excerpt = previewText2(result.chunk.text);
            return `${result.rank}. ${result.note.path} score=${result.score.toFixed(3)} lines=${result.anchor.startLine}-${result.anchor.endLine} excerpt="${excerpt}"`;
          })
        ];
        return okResult(
          `Found ${filtered.length} semantic matches`,
          payload,
          detailLines.join("\n")
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Model not found locally")) {
          const payload = {
            query: params.query,
            returned: 0,
            indexStatus: semanticService.getIndexStatus(),
            results: []
          };
          return okResult(
            "Semantic search unavailable: Model not found locally.",
            payload,
            `returned=0 indexedNotes=${payload.indexStatus.indexedNoteCount} indexedChunks=${payload.indexStatus.indexedChunkCount} pending=${payload.indexStatus.pendingCount}`
          );
        }
        const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", `semantic search failed: ${message}`);
        return errorResult(domainError);
      }
    }
  );
}

// src/server.ts
function readPackageVersion() {
  try {
    const currentDir = path6.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path6.resolve(currentDir, "../package.json");
    const parsed = JSON.parse(fs5.readFileSync(packageJsonPath, "utf8"));
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
var SERVER_VERSION = readPackageVersion();
function createServer(runtimePaths, pluginClient = new PluginClient()) {
  const server = new McpServer({
    name: "obsidian-companion-mcp",
    version: SERVER_VERSION
  });
  const useRemote = process.env.USE_REMOTE_EMBEDDING === "true";
  const semanticService = new SemanticService(
    useRemote,
    runtimePaths.vaultPath,
    runtimePaths.configDir
  );
  const vectorStore = new VectorStore(runtimePaths.vaultPath, runtimePaths.configDir);
  const editorService = new EditorService(pluginClient);
  const noteService = new NoteService(pluginClient, semanticService);
  registerSearchTools(server, noteService, semanticService);
  registerReadEditTools(server, noteService, editorService);
  registerNoteTools(server, noteService);
  registerCapabilityMatrixResource(server);
  registerSchemaSummaryResource(server);
  registerFallbackBehaviorResource(server);
  registerActiveEditorContextResource(server, editorService);
  registerRuntimeStatusResource(server, pluginClient);
  registerReviewChecklistResource(server);
  registerContextRewritePrompt(server);
  registerSearchThenInsertPrompt(server);
  registerAgentRuntimeReviewPrompt(server);
  return { server, pluginClient, semanticService, vectorStore };
}
async function resolveRuntimePaths(pluginClient) {
  const envVaultPath = process.env.OBSIDIAN_VAULT_PATH?.trim();
  const envConfigDir = process.env.OBSIDIAN_CONFIG_DIR?.trim();
  let handshake = null;
  try {
    handshake = await pluginClient.connect();
    logInfo("startup handshake completed");
  } catch (error) {
    const domainError = error instanceof DomainError ? error : new DomainError("INTERNAL", "startup handshake failed");
    logError(
      `startup handshake failed code=${domainError.code} correlationId=${domainError.correlationId} reason=${pluginClient.getRuntimeStatus().degradedReason ?? "n/a"}`
    );
  }
  const vaultPath = envVaultPath ?? handshake?.vaultPath;
  if (!vaultPath) {
    throw new DomainError(
      "VALIDATION",
      "Missing required vault path. Set OBSIDIAN_VAULT_PATH or start the Obsidian Companion plugin so the vault can be discovered automatically."
    );
  }
  const configDir = envConfigDir ?? handshake?.configDir ?? pluginClient.getConfigDir() ?? discoverVaultConfigDir(vaultPath) ?? "";
  if (!process.env.OBSIDIAN_VAULT_PATH) {
    process.env.OBSIDIAN_VAULT_PATH = vaultPath;
    logInfo(`applying dynamic configuration: vaultPath=${vaultPath}`);
  }
  if (configDir && !process.env.OBSIDIAN_CONFIG_DIR) {
    process.env.OBSIDIAN_CONFIG_DIR = configDir;
    logInfo(`applying dynamic configuration: configDir=${configDir}`);
  }
  return { vaultPath, configDir, handshake };
}
async function runServer() {
  const pluginClient = new PluginClient();
  const runtimePaths = await resolveRuntimePaths(pluginClient);
  const { server, semanticService, vectorStore } = createServer(runtimePaths, pluginClient);
  const existingNotes = await vectorStore.load();
  semanticService.setSnapshot(existingNotes);
  const shutdown = async () => {
    clearInterval(saveInterval);
    logInfo("shutting down, saving vector index...");
    await vectorStore.save(semanticService.getSnapshot());
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  const saveInterval = setInterval(
    async () => {
      await vectorStore.save(semanticService.getSnapshot());
    },
    5 * 60 * 1e3
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// src/index.ts
runServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`fatal startup error: ${message}`);
  process.exitCode = 1;
});
