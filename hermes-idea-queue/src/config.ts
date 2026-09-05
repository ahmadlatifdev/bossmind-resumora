import { z } from 'zod';

const envSchema = z.object({
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  REPO_ROOT: z.string().default(process.cwd()),
  BACKLOG_PATH: z.string().default('./data/sample-backlog.json'),
  HERMES_LLM_BASE_URL: z.string().default('https://api.deepseek.com/v1'),
  HERMES_LLM_API_KEY: z.string().optional().default(''),
  HERMES_LLM_MODEL: z.string().default('deepseek-chat'),
  CURSOR_API_KEY: z.string().optional().default(''),
  CURSOR_MODEL: z.string().default('composer-2.5'),
  CURSOR_DRY_RUN: z
    .string()
    .optional()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  PINECONE_API_KEY: z.string().optional().default(''),
  PINECONE_INDEX: z.string().default('resumora-idea-queue'),
  PINECONE_HOST: z.string().optional().default(''),
  EMBEDDING_DIM: z.coerce.number().default(384),
  RAG_TOP_K: z.coerce.number().default(8),
  RAG_MAX_CHARS: z.coerce.number().default(12_000),
  MAX_NIGHTLY_PRS: z.coerce.number().default(25),
  MAX_CONCURRENT_TASKS: z.coerce.number().default(2),
  MAX_QA_RETRIES: z.coerce.number().default(3),
  FILE_LOCK_TTL_SEC: z.coerce.number().default(1800),
  BRANCH_PREFIX: z.string().default('feat/auto-issue-'),
  HITL_PORT: z.coerce.number().default(8790),
  HITL_TOKEN: z.string().default('change-me-local-only'),
  GITHUB_TOKEN: z.string().optional().default(''),
  GITHUB_REPO: z.string().default('ahmadlatifdev/bossmind-resumora'),
  GIT_AUTHOR_NAME: z.string().default('Hermes Idea Queue'),
  GIT_AUTHOR_EMAIL: z.string().default('hermes-idea-queue@users.noreply.github.com'),
  PROTECTED_BASE_BRANCHES: z
    .string()
    .default('main,master,production')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  cached = envSchema.parse(env);
  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
