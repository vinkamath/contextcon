import { z } from "zod";

export const DecisionMakerSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  email: z.string().nullable(),
});
export type DecisionMaker = z.infer<typeof DecisionMakerSchema>;
