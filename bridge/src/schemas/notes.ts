import { z } from "zod";
import { notePathSchema } from "./common";

export const createNoteInputSchema = z.object({
    path: notePathSchema,
    content: z.string().default("").describe("Initial markdown content for the note"),
});

export const getNoteInputSchema = z.object({
    path: notePathSchema,
});

export const updateNoteContentInputSchema = z.object({
    path: notePathSchema,
    content: z.string().describe("Full markdown content to replace the note body"),
});

export const deleteNoteInputSchema = z.object({
    path: notePathSchema.describe("Vault-relative markdown note path to delete"),
});

export const updateNoteMetadataInputSchema = z.object({
    path: notePathSchema,
    metadata: z.record(z.unknown()).describe("Frontmatter key/value patch to merge"),
});
