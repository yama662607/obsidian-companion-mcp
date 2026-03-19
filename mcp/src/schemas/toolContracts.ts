import { z } from "zod";
import { limitSchema, notePathSchema, positionSchema, rangeSchema } from "./common";

const isoDateSchema = z.string().datetime({ offset: true });
const headingPathSchema = z.array(z.string().min(1)).min(1).max(16);

function jsonStringOr<TSchema extends z.ZodTypeAny>(schema: TSchema, fieldName: string) {
  return z
    .union([schema, z.string().min(1)])
    .transform((value, ctx) => {
      if (typeof value !== "string") {
        return value;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${fieldName} must be an object or a JSON string representing one`,
        });
        return z.NEVER;
      }

      const normalized = schema.safeParse(parsed);
      if (!normalized.success) {
        for (const issue of normalized.error.issues) {
          ctx.addIssue(issue);
        }
        return z.NEVER;
      }

      return normalized.data;
    })
    .pipe(schema);
}

export const noteAnchorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("full") }),
  z.object({
    type: z.literal("frontmatter"),
    startLine: z.number().int().min(0).optional(),
    endLine: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal("heading"),
    headingPath: headingPathSchema,
    startLine: z.number().int().min(0).optional(),
    endLine: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal("block"),
    blockId: z.string().min(1),
    startLine: z.number().int().min(0).optional(),
    endLine: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal("line"),
    startLine: z.number().int().min(0),
    endLine: z.number().int().min(0),
  }),
]);

export const activeAnchorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("full") }),
  z.object({
    type: z.literal("selection"),
    range: rangeSchema,
  }),
  z.object({
    type: z.literal("range"),
    range: rangeSchema,
  }),
  z.object({
    type: z.literal("cursor"),
    position: positionSchema,
  }),
]);

export const noteEditTargetSchema = z.object({
  source: z.literal("note"),
  note: notePathSchema.describe("Vault-relative note path"),
  anchor: noteAnchorSchema,
  revision: z.string().nullable(),
  currentText: z.string().optional(),
});

export const activeEditTargetSchema = z.object({
  source: z.literal("active"),
  activeFile: z.string().nullable(),
  anchor: activeAnchorSchema,
  revision: z.null(),
  currentText: z.string().optional(),
});

export const editTargetSchema = z.discriminatedUnion("source", [
  noteEditTargetSchema,
  activeEditTargetSchema,
]);

export const editChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replaceTarget"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("append"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("prepend"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("insertAtCursor"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("replaceText"),
    find: z.string().min(1),
    replace: z.string(),
    occurrence: z.union([
      z.literal("first"),
      z.literal("last"),
      z.literal("all"),
      z.number().int().min(1),
    ]),
  }),
]);

export const readNoteInputSchema = z.object({
  note: notePathSchema,
  anchor: jsonStringOr(noteAnchorSchema, "anchor").optional().default({ type: "full" }),
  maxChars: z.number().int().min(200).max(20_000).optional().default(6_000),
  include: z
    .object({
      metadata: z.boolean().optional().default(true),
      documentMap: z.boolean().optional().default(false),
    })
    .optional()
    .default({ metadata: true, documentMap: false }),
});

export const readActiveContextInputSchema = z.object({
  maxChars: z.number().int().min(200).max(20_000).optional().default(6_000),
});

export const editNoteInputSchema = z.object({
  target: jsonStringOr(editTargetSchema, "target"),
  change: jsonStringOr(editChangeSchema, "change"),
});

export const createNoteInputSchema = z.object({
  path: notePathSchema,
  content: z.string(),
});

export const patchNoteMetadataInputSchema = z.object({
  note: notePathSchema,
  metadata: z.record(z.unknown()),
});

export const moveNoteInputSchema = z.object({
  from: notePathSchema,
  to: notePathSchema,
});

export const deleteNoteInputSchema = z.object({
  note: notePathSchema,
});

export const listNotesInputSchema = z.object({
  path: z
    .string()
    .optional()
    .default("")
    .describe("Vault-relative directory path. Empty string means vault root."),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
  recursive: z.boolean().optional().default(false),
  includeDirs: z.boolean().optional().default(true),
});

const frontmatterEqualsFilterSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const lexicalSearchInputSchema = z.object({
  query: z.string().trim().optional(),
  pathPrefix: z.string().optional(),
  filters: z
    .object({
      tagsAny: z.array(z.string().min(1)).optional(),
      tagsAll: z.array(z.string().min(1)).optional(),
      frontmatterEquals: z.array(frontmatterEqualsFilterSchema).optional(),
      modifiedAfter: isoDateSchema.optional(),
      modifiedBefore: isoDateSchema.optional(),
      filenameGlob: z.string().optional(),
    })
    .optional(),
  sort: z
    .enum(["relevance", "modifiedDesc", "modifiedAsc", "pathAsc"])
    .optional()
    .default("relevance"),
  limit: limitSchema.optional().default(10),
  cursor: z.string().optional(),
  include: z
    .object({
      snippet: z.boolean().optional().default(true),
      matchLocations: z.boolean().optional().default(true),
      tags: z.boolean().optional().default(false),
      frontmatterKeys: z.array(z.string().min(1)).optional().default([]),
    })
    .optional()
    .default({ snippet: true, matchLocations: true, tags: false, frontmatterKeys: [] }),
});

export const semanticSearchInputSchema = z.object({
  query: z.string().min(1),
  pathPrefix: z.string().optional(),
  filters: z
    .object({
      tagsAny: z.array(z.string().min(1)).optional(),
      tagsAll: z.array(z.string().min(1)).optional(),
      modifiedAfter: isoDateSchema.optional(),
      modifiedBefore: isoDateSchema.optional(),
      notePaths: z.array(notePathSchema).optional(),
    })
    .optional(),
  topK: z.number().int().min(1).max(20).optional().default(8),
  maxPerNote: z.number().int().min(1).max(5).optional().default(2),
  minScore: z.number().min(-1).max(1).optional(),
  include: z
    .object({
      tags: z.boolean().optional().default(false),
      frontmatterKeys: z.array(z.string().min(1)).optional().default([]),
      neighboringLines: z.number().int().min(0).max(5).optional().default(0),
    })
    .optional()
    .default({ tags: false, frontmatterKeys: [], neighboringLines: 0 }),
});

export const semanticIndexStatusInputSchema = z.object({
  pendingSampleLimit: z.number().int().min(1).max(50).optional().default(20),
});

export const refreshSemanticIndexInputSchema = z.object({});

const noteSummarySchema = z.object({
  path: notePathSchema,
  title: z.string(),
  modifiedAt: isoDateSchema,
  size: z.number().int().min(0).optional(),
});

const noteSelectionSchema = z.object({
  anchor: z.object({
    type: z.enum(["full", "frontmatter", "heading", "block", "line"]),
    headingPath: headingPathSchema.optional(),
    blockId: z.string().optional(),
    startLine: z.number().int().min(0).optional(),
    endLine: z.number().int().min(0).optional(),
  }),
  totalLines: z.number().int().min(0),
});

export const readNoteOutputSchema = z.object({
  note: noteSummarySchema,
  revision: z.string(),
  selection: noteSelectionSchema,
  content: z.object({
    text: z.string(),
    truncated: z.boolean(),
    charsReturned: z.number().int().min(0),
  }),
  metadata: z
    .object({
      tags: z.array(z.string()),
      frontmatter: z.record(z.unknown()),
    })
    .nullable(),
  documentMap: z
    .object({
      headings: z.array(
        z.object({
          path: z.array(z.string()),
          level: z.number().int().min(1),
          startLine: z.number().int().min(0),
          endLine: z.number().int().min(0),
        }),
      ),
      blocks: z.array(
        z.object({
          blockId: z.string(),
          startLine: z.number().int().min(0),
          endLine: z.number().int().min(0),
        }),
      ),
      frontmatterFields: z.array(z.string()),
    })
    .nullable(),
  readMoreHint: z
    .object({
      note: notePathSchema,
      anchor: noteAnchorSchema,
      maxChars: z.number().int().min(200).max(20_000),
    })
    .nullable(),
  editTarget: noteEditTargetSchema,
  documentEditTarget: noteEditTargetSchema,
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
});

export const readActiveContextOutputSchema = z.object({
  activeFile: z.string().nullable(),
  cursor: positionSchema.nullable(),
  selection: z.string(),
  selectionTruncated: z.boolean(),
  selectionCharsReturned: z.number().int().min(0),
  selectionTotalChars: z.number().int().min(0),
  selectionRange: rangeSchema.nullable(),
  content: z.string(),
  contentTruncated: z.boolean(),
  contentCharsReturned: z.number().int().min(0),
  contentTotalChars: z.number().int().min(0),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
  noActiveEditor: z.boolean(),
  editorState: z.enum(["active", "none"]),
  editTargets: z
    .object({
      selection: activeEditTargetSchema.optional(),
      cursor: activeEditTargetSchema.optional(),
      document: activeEditTargetSchema.optional(),
    })
    .nullable(),
});

export const editNoteOutputSchema = z.object({
  status: z.enum(["applied", "noOp"]),
  target: z.object({
    source: z.enum(["note", "active"]),
    note: notePathSchema.optional(),
    activeFile: z.string().nullable().optional(),
    anchor: z.object({
      type: z.enum([
        "full",
        "frontmatter",
        "heading",
        "block",
        "line",
        "selection",
        "range",
        "cursor",
      ]),
      headingPath: headingPathSchema.optional(),
      blockId: z.string().optional(),
      startLine: z.number().int().min(0).optional(),
      endLine: z.number().int().min(0).optional(),
      range: rangeSchema.optional(),
      position: positionSchema.optional(),
    }),
  }),
  revisionBefore: z.string().nullable(),
  revisionAfter: z.string().nullable(),
  preview: z.object({
    before: z.string(),
    after: z.string(),
  }),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
  readBack: z.object({
    tool: z.enum(["read_note", "read_active_context"]),
    input: z.record(z.unknown()),
  }),
  warnings: z.array(z.string()),
});

export const listNotesOutputSchema = z.object({
  path: z.string(),
  returned: z.number().int().min(0),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
  entries: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      kind: z.enum(["file", "directory"]),
      updatedAt: isoDateSchema,
      size: z.number().int().min(0),
    }),
  ),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
});

export const searchNotesOutputSchema = z.object({
  query: z.string().nullable(),
  sort: z.enum(["relevance", "modifiedDesc", "modifiedAsc", "pathAsc"]),
  totalMatches: z.number().int().min(0),
  returned: z.number().int().min(0),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
  results: z.array(
    z.object({
      note: noteSummarySchema.omit({ size: true }),
      score: z.number(),
      matchedFields: z.array(z.enum(["path", "text", "frontmatter", "tags"])),
      bestAnchor: z
        .object({
          type: z.literal("line"),
          startLine: z.number().int().min(0),
          endLine: z.number().int().min(0),
          headingPath: headingPathSchema.optional(),
        })
        .nullable(),
      snippet: z
        .object({
          text: z.string(),
          startLine: z.number().int().min(0),
          endLine: z.number().int().min(0),
        })
        .nullable(),
      metadata: z
        .object({
          tags: z.array(z.string()).optional(),
          frontmatter: z.record(z.unknown()).optional(),
        })
        .nullable(),
      readHint: z.object({
        note: notePathSchema,
        anchor: noteAnchorSchema,
      }),
    }),
  ),
});

export const semanticIndexStatusOutputSchema = z.object({
  pendingCount: z.number().int().min(0),
  indexedNoteCount: z.number().int().min(0),
  indexedChunkCount: z.number().int().min(0),
  running: z.boolean(),
  ready: z.boolean(),
  isEmpty: z.boolean(),
  modelReady: z.boolean(),
  pendingSample: z.array(z.string()),
});

export const semanticSearchOutputSchema = z.object({
  query: z.string(),
  returned: z.number().int().min(0),
  indexStatus: semanticIndexStatusOutputSchema,
  results: z.array(
    z.object({
      rank: z.number().int().min(1),
      score: z.number(),
      note: noteSummarySchema.omit({ size: true }),
      anchor: z.object({
        type: z.literal("line"),
        startLine: z.number().int().min(0),
        endLine: z.number().int().min(0),
        headingPath: headingPathSchema.nullable(),
      }),
      chunk: z.object({
        id: z.string(),
        text: z.string(),
        startLine: z.number().int().min(0),
        endLine: z.number().int().min(0),
      }),
      metadata: z
        .object({
          tags: z.array(z.string()).optional(),
          frontmatter: z.record(z.unknown()).optional(),
        })
        .nullable(),
      readHint: z.object({
        note: notePathSchema,
        anchor: noteAnchorSchema,
      }),
    }),
  ),
});

export const createNoteOutputSchema = z.object({
  note: z.object({ path: notePathSchema }),
  created: z.boolean(),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
});

export const patchNoteMetadataOutputSchema = z.object({
  note: z.object({ path: notePathSchema }),
  metadata: z.record(z.unknown()),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
});

export const moveNoteOutputSchema = z.object({
  from: notePathSchema,
  to: notePathSchema,
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
});

export const deleteNoteOutputSchema = z.object({
  note: z.object({ path: notePathSchema }),
  deleted: z.boolean(),
  degraded: z.boolean(),
  degradedReason: z.string().nullable(),
});

export const refreshSemanticIndexOutputSchema = z.object({
  totalFound: z.number().int().min(0),
  queuedCount: z.number().int().min(0),
  flushedCount: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
  indexedNoteCount: z.number().int().min(0),
  indexedChunkCount: z.number().int().min(0),
  modelReady: z.boolean(),
});
