import { z } from 'zod';

export const IdeaStatusSchema = z.enum([
  'pending',
  'triaged',
  'queued',
  'awaiting_hitl',
  'approved',
  'running',
  'qa_failed',
  'retrying',
  'pr_ready',
  'failed',
  'rejected',
  'done',
]);

export type IdeaStatus = z.infer<typeof IdeaStatusSchema>;

export const RawIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  source: z.string().optional(),
  tags: z.array(z.string()).default([]),
  requestedFiles: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
  priorityHint: z.number().min(0).max(100).optional(),
});

export type RawIdea = z.infer<typeof RawIdeaSchema>;

export const TriagedIdeaSchema = RawIdeaSchema.extend({
  status: IdeaStatusSchema.default('triaged'),
  priorityScore: z.number().min(0).max(100),
  duplicateOf: z.string().nullable().default(null),
  riskFlags: z.array(z.string()).default([]),
  requiresHitl: z.boolean().default(false),
  dagDepth: z.number().int().nonnegative().default(0),
  contextDigest: z.string().optional(),
  branchName: z.string().optional(),
  prUrl: z.string().optional(),
  qaAttempts: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
  lockedFiles: z.array(z.string()).default([]),
});

export type TriagedIdea = z.infer<typeof TriagedIdeaSchema>;

export type DagNode = {
  id: string;
  dependsOn: string[];
  depth: number;
};

export type AgentState = {
  idea: TriagedIdea;
  contextPack: string;
  lockedFiles: string[];
  branchName: string;
  lintOk: boolean;
  testsOk: boolean;
  commitSha: string | null;
  prUrl: string | null;
  error: string | null;
  attempt: number;
};

export type QueueJobPayload = {
  ideaId: string;
  attempt: number;
  trigger: 'nightly' | 'manual' | 'self_heal' | 'hitl_approved';
  failureLog?: string;
};

export type HitlDecision = {
  ideaId: string;
  decision: 'approve' | 'reject';
  reviewer: string;
  note?: string;
  at: string;
};
