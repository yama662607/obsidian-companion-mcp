import { z } from "zod";
import { notePathSchema } from "./common";

export const manageNoteInputSchema = z.object({
    action: z.enum(["create", "read", "update", "delete"]),
    path: notePathSchema,
    content: z.string().optional(),
});

export const manageMetadataInputSchema = z.object({
    path: notePathSchema,
    metadata: z.record(z.unknown()),
});
