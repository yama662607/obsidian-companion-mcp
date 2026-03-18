import { z } from "zod";

export const notePathSchema = z
  .string()
  .min(1)
  .refine((value) => {
    const normalized = value.replaceAll("\\", "/");
    return !normalized.startsWith("/") && !normalized.startsWith("../") && normalized !== "..";
  }, "Path must be vault-relative")
  .describe("Vault-relative markdown note path");

export const limitSchema = z.number().int().min(1).max(50).default(10);

export const positionSchema = z.object({
  line: z.number().int().min(0),
  ch: z.number().int().min(0),
});

export const rangeSchema = z.object({
  from: positionSchema,
  to: positionSchema,
});
