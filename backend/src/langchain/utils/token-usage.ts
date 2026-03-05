/**
 * Token usage tracking for OpenAI and Cohere across the onboarding flow.
 * - OpenAI: captured via callback from LLM responses (prompt + completion tokens)
 * - Cohere: estimated from embedding input (RAG queries) - ~4 chars per token for English
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';

export interface TokenUsageSummary {
  openai: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cohere: { inputTokens: number };
  total: { openai: number; cohere: number };
}

function createEmptySummary(): TokenUsageSummary {
  return {
    openai: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    cohere: { inputTokens: 0 },
    total: { openai: 0, cohere: 0 },
  };
}

let currentUsage: TokenUsageSummary | null = null;

export function getTokenUsageTracker(): TokenUsageSummary {
  if (!currentUsage) currentUsage = createEmptySummary();
  return currentUsage;
}

export function setTokenUsageTracker(tracker: TokenUsageSummary | null): void {
  currentUsage = tracker;
}

export function resetTokenUsageTracker(): TokenUsageSummary | null {
  const prev = currentUsage;
  currentUsage = null;
  return prev;
}

/** Estimate Cohere tokens from text (embed-english-v3.0: ~4 chars per token for English) */
export function estimateCohereTokens(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

export function addCohereUsage(estimatedTokens: number): void {
  const t = getTokenUsageTracker();
  t.cohere.inputTokens += estimatedTokens;
  t.total.cohere = t.cohere.inputTokens;
}

/**
 * Callback handler that captures OpenAI token usage from LLM runs.
 */
export class TokenUsageCallbackHandler extends BaseCallbackHandler {
  name = 'TokenUsageCallbackHandler';
  private tracker: TokenUsageSummary;

  constructor(tracker?: TokenUsageSummary) {
    super();
    this.tracker = tracker ?? getTokenUsageTracker();
  }

  async handleLLMEnd(output: LLMResult): Promise<void> {
    const usage =
      (output as any).llmOutput?.tokenUsage ??
      (output as any).llmOutput?.usage_metadata;
    if (!usage) return;

    const prompt = Number(
      usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? 0,
    );
    const completion = Number(
      usage.completionTokens ??
        usage.completion_tokens ??
        usage.output_tokens ??
        0,
    );
    const total =
      Number(usage.totalTokens ?? usage.total_tokens) || prompt + completion;

    if (prompt > 0 || completion > 0) {
      this.tracker.openai.promptTokens += prompt;
      this.tracker.openai.completionTokens += completion;
      this.tracker.openai.totalTokens +=
        total > 0 ? total : prompt + completion;
      this.tracker.total.openai = this.tracker.openai.totalTokens;
    }
  }
}

export function formatTokenUsageSummary(summary: TokenUsageSummary): string {
  const lines: string[] = [
    '=== Token Usage Summary ===',
    `OpenAI: ${summary.openai.promptTokens} prompt + ${summary.openai.completionTokens} completion = ${summary.openai.totalTokens} total`,
    `Cohere: ~${summary.cohere.inputTokens} input (estimated)`,
    `Total: OpenAI ${summary.total.openai} | Cohere ${summary.total.cohere}`,
  ];
  return lines.join('\n');
}
