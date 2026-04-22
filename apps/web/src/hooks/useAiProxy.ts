/**
 * useAiProxy — Shared hook for calling the AI proxy endpoint.
 *
 * All AI calls are routed through /api/v1/ai/proxy.
 * The hook handles loading, error, and result state.
 *
 * SECURITY: The task name and input are validated server-side.
 * The hook never constructs or modifies system prompts.
 */

import { useState, useCallback } from 'react';
import { api } from '../lib/apiClient';

interface AiProxyResponse {
  task: string;
  output: Record<string, unknown>;
  model_used: string;
  tokens_used: number;
}

export interface UseAiProxyResult {
  loading: boolean;
  result: Record<string, unknown> | null;
  error: string | null;
  run: (task: string, input: Record<string, unknown>) => Promise<void>;
  reset: () => void;
}

export function useAiProxy(): UseAiProxyResult {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (task: string, input: Record<string, unknown>): Promise<void> => {
    setLoading(true);
    setError(null);
    setResult(null);

    const idempotency_key = `${task}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const res = await api.post<AiProxyResponse>('/api/v1/ai/proxy', {
      task,
      input,
      idempotency_key,
    });

    setLoading(false);

    if (res.success && res.data) {
      setResult(res.data.output);
    } else {
      setError(res.error?.message ?? 'AI request failed. Please try again.');
    }
  }, []);

  const reset = useCallback((): void => {
    setResult(null);
    setError(null);
  }, []);

  return { loading, result, error, run, reset };
}
