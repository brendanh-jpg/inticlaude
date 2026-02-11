import { z } from "zod";

export const owlCredentialsSchema = z.object({
  url: z.string().min(1, "Owl Practice URL is required"),
  email: z.string().email("Must be a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const playspaceCredentialsSchema = z.object({
  clientId: z.string().min(1, "PlaySpace OAuth client ID is required"),
  clientSecret: z.string().min(1, "PlaySpace OAuth client secret is required"),
  auth0Domain: z.string().min(1, "Auth0 domain is required"),
  audience: z.string().min(1, "Auth0 audience is required"),
  baseUrl: z.string().url().optional(),
});

export const syncRequestSchema = z.object({
  practiceId: z.string().min(1, "Practice ID is required"),
  owlPractice: owlCredentialsSchema,
  data: z.object({
    clients: z.array(z.any()).default([]),
    appointments: z.array(z.any()).default([]),
    sessionNotes: z.array(z.any()).default([]),
  }),
  options: z.object({
    dryRun: z.boolean().default(false),
    entities: z.array(z.enum(["client", "appointment", "sessionNote"])).optional(),
  }).optional(),
});

export type OwlCredentials = z.infer<typeof owlCredentialsSchema>;
export type PlaySpaceCredentials = z.infer<typeof playspaceCredentialsSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
