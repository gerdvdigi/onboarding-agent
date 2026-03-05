/**
 * Computes discovery progress percentage from messages.
 * Mirrors frontend logic for consistency.
 */

const BASE_STEPS = 5;
const SALES_QUESTIONS = 4;
const SERVICE_QUESTIONS = 6;
const MARKETING_QUESTIONS = 6;

function parseActiveHubs(hubsText: string): {
  sales: boolean;
  marketing: boolean;
  service: boolean;
} {
  const text = String(hubsText || '').toLowerCase();
  const serviceExcluded = /service\s+(can\s+)?(come|wait|later|future|not\s+now)/i.test(
    text,
  );
  const salesExcluded = /sales\s+(can\s+)?(come|wait|later)/i.test(text);
  const marketingExcluded = /marketing\s+(can\s+)?(come|wait|later)/i.test(text);
  return {
    sales: /\bsales\b/i.test(text) && !salesExcluded,
    marketing: /\bmarketing\b/i.test(text) && !marketingExcluded,
    service: /\bservice\b/i.test(text) && !serviceExcluded,
  };
}

function countAnsweredPairs(
  messages: Array<{ role: string; content: string }>,
): number {
  let count = 0;
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    if (
      msg.role === 'assistant' &&
      next.role === 'user' &&
      msg.content.trim() &&
      next.content.trim()
    ) {
      count++;
    }
  }
  return count;
}

export function getDiscoveryProgress(
  messages: Array<{ role: string; content: string }>,
  answersCollected?: Record<string, string>,
): { completed: number; total: number; percentage: number } {
  const completed = countAnsweredPairs(messages);
  const hubsText = answersCollected?.hubs_included ?? '';
  const activeHubs = parseActiveHubs(hubsText);

  let total = BASE_STEPS;
  if (hubsText) {
    if (activeHubs.sales) total += SALES_QUESTIONS;
    if (activeHubs.service) total += SERVICE_QUESTIONS;
    if (activeHubs.marketing) total += MARKETING_QUESTIONS;
  } else {
    total =
      BASE_STEPS + SALES_QUESTIONS + SERVICE_QUESTIONS + MARKETING_QUESTIONS;
  }

  const percentage =
    total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  return { completed, total, percentage };
}
