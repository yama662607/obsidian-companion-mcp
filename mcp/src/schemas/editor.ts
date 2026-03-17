import { z } from "zod";
import { positionSchema, rangeSchema } from "./common";

export const activeContextInputSchema = z.object({});

export const insertAtCursorInputSchema = z.object({
    text: z.string().describe("Text to insert at cursor position"),
    position: positionSchema,
});

export const replaceRangeInputSchema = z.object({
    text: z.string().describe("Replacement text"),
    range: rangeSchema,
});
