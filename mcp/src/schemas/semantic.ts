import { z } from "zod";
import { limitSchema } from "./common";

export const semanticSearchInputSchema = z.object({
  query: z.string().min(1).describe("Semantic search query text"),
  limit: limitSchema.describe("Maximum number of ranked matches"),
});
