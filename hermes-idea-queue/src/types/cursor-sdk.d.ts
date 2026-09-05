declare module '@cursor/sdk' {
  export class CursorAgentError extends Error {
    isRetryable?: boolean;
  }
  export const Agent: {
    prompt: (
      prompt: string,
      options: {
        apiKey: string;
        model: { id: string };
        local: { cwd: string };
      }
    ) => Promise<{ status?: string; result?: string; id?: string }>;
    create: (options: Record<string, unknown>) => Promise<{
      send: (prompt: string) => Promise<{
        wait: () => Promise<{ status?: string; id?: string }>;
        stream: () => AsyncIterable<unknown>;
      }>;
    }>;
  };
}
