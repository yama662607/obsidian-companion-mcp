import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseFrontmatter } from "../../../shared/frontmatter";
import { TOOL_NAMES } from "../constants/toolNames";
import { DomainError } from "../domain/errors";
import { findSnippetForQuery, readTitleFromPath } from "../domain/noteDocument";
import type { NoteService } from "../domain/noteService";
import type { SemanticService } from "../domain/semanticService";
import { errorResult, okResult } from "../domain/toolResult";
import * as fallback from "../infra/fallbackStorage";
import {
  lexicalSearchInputSchema,
  searchNotesOutputSchema,
  semanticSearchInputSchema,
  semanticSearchOutputSchema,
} from "../schemas/toolContracts";

function toIsoDate(value: number): string {
  return new Date(value).toISOString();
}

function extractTags(metadata: Record<string, unknown>): string[] {
  const rawTags = metadata.tags;
  if (Array.isArray(rawTags)) {
    return rawTags.filter((value): value is string => typeof value === "string");
  }
  if (typeof rawTags === "string" && rawTags.trim().length > 0) {
    return [rawTags];
  }
  return [];
}

function buildGlobRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§§DOUBLESTAR§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§DOUBLESTAR§§/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesFilters(
  note: { path: string; updatedAt: number; metadata: Record<string, unknown> },
  filters:
    | {
        tagsAny?: string[];
        tagsAll?: string[];
        frontmatterEquals?: Array<{ key: string; value: string | number | boolean }>;
        modifiedAfter?: string;
        modifiedBefore?: string;
        filenameGlob?: string;
      }
    | undefined,
): boolean {
  if (!filters) {
    return true;
  }

  const tags = extractTags(note.metadata);
  if (filters.tagsAny && !filters.tagsAny.some((tag) => tags.includes(tag))) {
    return false;
  }
  if (filters.tagsAll && !filters.tagsAll.every((tag) => tags.includes(tag))) {
    return false;
  }
  if (
    filters.frontmatterEquals &&
    !filters.frontmatterEquals.every(({ key, value }) => note.metadata[key] === value)
  ) {
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

function encodeCursor(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new DomainError("VALIDATION", "Invalid search cursor");
  }
}

type SearchCandidate = {
  path: string;
  title: string;
  updatedAt: number;
  score: number;
  matchedFields: Array<"path" | "text" | "frontmatter" | "tags">;
  snippet: { text: string; startLine: number; endLine: number } | null;
  metadata: Record<string, unknown>;
};

export function registerSearchTools(
  server: McpServer,
  _noteService: NoteService,
  semanticService: SemanticService,
): void {
  server.registerTool(
    TOOL_NAMES.SEARCH_NOTES,
    {
      description: "Find notes by lexical text matching and metadata filters.",
      inputSchema: lexicalSearchInputSchema,
      outputSchema: searchNotesOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    (params) => {
      try {
        if (!params.query?.trim() && !params.filters) {
          throw new DomainError("VALIDATION", "Either query or filters is required");
        }

        const normalizedQuery = params.query?.trim().toLowerCase() ?? "";
        const notes = fallback
          .listNotes()
          .filter((note) => !params.pathPrefix || note.path.startsWith(params.pathPrefix))
          .map((note) => {
            const metadata = parseFrontmatter(note.content);
            const tags = extractTags(metadata);
            const matchedFields: Array<"path" | "text" | "frontmatter" | "tags"> = [];
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
              metadata,
            } satisfies SearchCandidate;
          })
          .filter((note) => matchesFilters(note, params.filters))
          .filter((note) => (normalizedQuery ? note.score > 0 : true));

        const compareBySort = {
          relevance: (left: SearchCandidate, right: SearchCandidate) =>
            right.score - left.score || left.path.localeCompare(right.path, "en"),
          modifiedDesc: (left: SearchCandidate, right: SearchCandidate) =>
            right.updatedAt - left.updatedAt || left.path.localeCompare(right.path, "en"),
          modifiedAsc: (left: SearchCandidate, right: SearchCandidate) =>
            left.updatedAt - right.updatedAt || left.path.localeCompare(right.path, "en"),
          pathAsc: (left: SearchCandidate, right: SearchCandidate) =>
            left.path.localeCompare(right.path, "en"),
        }[params.sort];

        notes.sort(compareBySort);

        let startIndex = 0;
        if (params.cursor) {
          const decoded = decodeCursor(params.cursor);
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
          nextCursor:
            hasMore && results.length > 0 ? encodeCursor(results[results.length - 1].path) : null,
          results: results.map((result) => {
            const selectedFrontmatter =
              params.include.frontmatterKeys.length > 0
                ? Object.fromEntries(
                    params.include.frontmatterKeys
                      .filter((key) => key in result.metadata)
                      .map((key) => [key, result.metadata[key]]),
                  )
                : undefined;
            return {
              note: {
                path: result.path,
                title: result.title,
                modifiedAt: toIsoDate(result.updatedAt),
              },
              score: result.score,
              matchedFields: result.matchedFields,
              bestAnchor: result.snippet
                ? {
                    type: "line" as const,
                    startLine: result.snippet.startLine,
                    endLine: result.snippet.endLine,
                  }
                : null,
              snippet:
                params.include.snippet && result.snippet
                  ? {
                      text: result.snippet.text,
                      startLine: result.snippet.startLine,
                      endLine: result.snippet.endLine,
                    }
                  : null,
              metadata:
                params.include.tags || selectedFrontmatter
                  ? {
                      ...(params.include.tags ? { tags: extractTags(result.metadata) } : {}),
                      ...(selectedFrontmatter ? { frontmatter: selectedFrontmatter } : {}),
                    }
                  : null,
              readHint: {
                note: result.path,
                anchor: result.snippet
                  ? {
                      type: "line" as const,
                      startLine: result.snippet.startLine,
                      endLine: result.snippet.endLine,
                    }
                  : { type: "full" as const },
              },
            };
          }),
        };

        const detailLines = [
          `returned=${payload.returned} total=${payload.totalMatches} sort=${payload.sort} hasMore=${payload.hasMore}`,
          ...payload.results.slice(0, 10).map((result, index) => {
            const snippet = result.snippet?.text.replace(/\s+/g, " ").trim();
            return `${index + 1}. ${result.note.path} score=${result.score} fields=${result.matchedFields.join(",") || "none"}${snippet ? ` snippet="${snippet}"` : ""} readHint=${JSON.stringify(result.readHint)}`;
          }),
        ];

        return okResult(`Found ${results.length} matching notes`, payload, detailLines.join("\n"));
      } catch (error) {
        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", "lexical search failed");
        return errorResult(domainError);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.SEMANTIC_SEARCH_NOTES,
    {
      description: "Find conceptually related note passages using a semantic index.",
      inputSchema: semanticSearchInputSchema,
      outputSchema: semanticSearchOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const searchResult = await semanticService.searchWithStatus(params.query, {
          topK: params.topK * 5,
          maxPerNote: Math.max(params.maxPerNote, 5),
          minScore: params.minScore,
          pathPrefix: params.pathPrefix,
          notePaths: params.filters?.notePaths,
        });

        const perNote = new Map<string, number>();
        const filtered = searchResult.matches
          .filter((match) => {
            if (
              params.filters?.modifiedAfter &&
              match.updatedAt < new Date(params.filters.modifiedAfter).getTime()
            ) {
              return false;
            }
            if (
              params.filters?.modifiedBefore &&
              match.updatedAt > new Date(params.filters.modifiedBefore).getTime()
            ) {
              return false;
            }
            if (!params.filters?.tagsAny && !params.filters?.tagsAll) {
              return true;
            }
            const metadata = fallback.readNote(match.path)?.metadata ?? {};
            const tags = extractTags(metadata);
            if (
              params.filters.tagsAny &&
              !params.filters.tagsAny.some((tag) => tags.includes(tag))
            ) {
              return false;
            }
            if (
              params.filters.tagsAll &&
              !params.filters.tagsAll.every((tag) => tags.includes(tag))
            ) {
              return false;
            }
            return true;
          })
          .filter((match) => {
            const count = perNote.get(match.path) ?? 0;
            if (count >= params.maxPerNote) {
              return false;
            }
            perNote.set(match.path, count + 1);
            return true;
          })
          .slice(0, params.topK);

        const payload = {
          query: params.query,
          returned: filtered.length,
          indexStatus: searchResult.indexStatus,
          results: filtered.map((match, index) => {
            const metadata = fallback.readNote(match.path)?.metadata ?? {};
            const selectedFrontmatter =
              params.include.frontmatterKeys.length > 0
                ? Object.fromEntries(
                    params.include.frontmatterKeys
                      .filter((key) => key in metadata)
                      .map((key) => [key, metadata[key]]),
                  )
                : undefined;
            const noteContent =
              params.include.neighboringLines > 0 ? fallback.readNote(match.path)?.content : null;
            let chunkText = match.text;
            if (noteContent) {
              const lines = noteContent.split("\n");
              const startLine = Math.max(match.startLine - params.include.neighboringLines, 0);
              const endLine = Math.min(
                match.endLine + params.include.neighboringLines,
                lines.length - 1,
              );
              chunkText = lines
                .slice(startLine, endLine + 1)
                .join("\n")
                .trim();
            }
            return {
              rank: index + 1,
              score: match.score,
              note: {
                path: match.path,
                title: match.title,
                modifiedAt: toIsoDate(match.updatedAt),
              },
              anchor: {
                type: "line" as const,
                startLine: match.startLine,
                endLine: match.endLine,
                headingPath: match.headingPath,
              },
              chunk: {
                id: match.id,
                text: chunkText,
                startLine: match.startLine,
                endLine: match.endLine,
              },
              metadata:
                params.include.tags || selectedFrontmatter
                  ? {
                      ...(params.include.tags ? { tags: extractTags(metadata) } : {}),
                      ...(selectedFrontmatter ? { frontmatter: selectedFrontmatter } : {}),
                    }
                  : null,
              readHint: {
                note: match.path,
                anchor: {
                  type: "line" as const,
                  startLine: match.startLine,
                  endLine: match.endLine,
                },
              },
            };
          }),
        };

        const detailLines = [
          `returned=${payload.returned} indexedNotes=${payload.indexStatus.indexedNoteCount} indexedChunks=${payload.indexStatus.indexedChunkCount} pending=${payload.indexStatus.pendingCount}`,
          ...payload.results.slice(0, 10).map((result) => {
            const excerpt = result.chunk.text.replace(/\s+/g, " ").trim();
            return `${result.rank}. ${result.note.path} score=${result.score.toFixed(3)} lines=${result.anchor.startLine}-${result.anchor.endLine} excerpt="${excerpt}" readHint=${JSON.stringify(result.readHint)}`;
          }),
        ];

        return okResult(
          `Found ${filtered.length} semantic matches`,
          payload,
          detailLines.join("\n"),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Model not found locally")) {
          const payload = {
            query: params.query,
            returned: 0,
            indexStatus: semanticService.getIndexStatus(),
            results: [],
          };
          return okResult(
            "Semantic search unavailable: Model not found locally.",
            payload,
            `returned=0 indexedNotes=${payload.indexStatus.indexedNoteCount} indexedChunks=${payload.indexStatus.indexedChunkCount} pending=${payload.indexStatus.pendingCount}`,
          );
        }

        const domainError =
          error instanceof DomainError
            ? error
            : new DomainError("INTERNAL", `semantic search failed: ${message}`);
        return errorResult(domainError);
      }
    },
  );
}
