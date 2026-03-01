import { z } from "zod";

export const RemediationActionsSchema = z.object({
  actions: z.array(z.string().min(1)).min(1, "Must return at least 1 action"),
});

export type RemediationActions = z.infer<typeof RemediationActionsSchema>;

export const DailyBriefingInsightsSchema = z.object({
  insights: z.array(z.string().min(1)).min(1, "Must return at least 1 insight"),
});

export type DailyBriefingInsights = z.infer<typeof DailyBriefingInsightsSchema>;
