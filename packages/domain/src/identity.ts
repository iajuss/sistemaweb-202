import { z } from "zod";

export const IdentityRefSchema = z
  .object({
    provider: z.string().min(1),
    subject: z.string().min(1),
  })
  .strict();

export type IdentityRef = z.infer<typeof IdentityRefSchema>;
