import { z } from "zod";

export const createNoteInputSchema = z.object({
    path: z.string().describe("Vault-relative path (e.g., 'notes/idea.md')"),
    content: z.string().describe("Full markdown content"),
});

export const getNoteInputSchema = z.object({
    path: z.string().describe("Vault-relative path"),
});

export const updateNoteContentInputSchema = z.object({
    path: z.string().describe("Vault-relative path"),
    content: z.string().describe("New full content"),
});

export const deleteNoteInputSchema = z.object({
    path: z.string().describe("Vault-relative markdown note path to delete"),
});

export const updateNoteMetadataInputSchema = z.object({
    path: z.string().describe("Vault-relative path"),
    metadata: z.record(z.any()).describe("Key-value pairs for frontmatter"),
});
