/**
 * Shared types for BossMind dual-channel harness (admin + client).
 */

export type HarnessScope = 'admin' | 'client';

export type HarnessRole = 'user' | 'assistant' | 'system' | 'tool';

export type HarnessMessage = {
  id: string;
  role: HarnessRole;
  content: string;
  createdAt: string;
  scope: HarnessScope;
  toolCalls?: HarnessToolCall[];
  toolResults?: HarnessToolResult[];
  needsHuman?: boolean;
};

export type HarnessSession = {
  id: string;
  scope: HarnessScope;
  uid?: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages?: HarnessMessage[];
};

export type HarnessToolCall = {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status?: 'pending' | 'running' | 'success' | 'error' | 'blocked';
};

export type HarnessToolResult = {
  id: string;
  toolCallId: string;
  name: string;
  ok: boolean;
  output?: unknown;
  error?: string;
};

export type HarnessSendPayload = {
  sessionId: string;
  message: string;
  scope: HarnessScope;
  password?: string;
};

export type HarnessSendResponse = {
  ok: boolean;
  sessionId: string;
  message?: HarnessMessage;
  reply?: string;
  toolCalls?: HarnessToolCall[];
  toolResults?: HarnessToolResult[];
  needsHuman?: boolean;
  error?: string;
};
