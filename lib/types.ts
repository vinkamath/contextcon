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

export const BriefSchema = z.object({
  id: z.string(),
  decision_maker_id: z.string(),
  decision_maker_name: z.string(),
  decision_maker_email: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  candidate_ids: z.array(z.string()),
  generated_at: z.string(),
});
export type Brief = z.infer<typeof BriefSchema>;

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  current_title: z.string().nullable(),
  current_company: z.string().nullable(),
  location: z.string().nullable(),
  headline: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  websites: z.array(z.string()).nullable(),
  portfolio_url: z.string().nullable(),
  portfolio_score: z.number().nullable(),
  signals: z.unknown().nullable(),
  enriched_at: z.string().nullable(),
});
export type Candidate = z.infer<typeof CandidateSchema>;
