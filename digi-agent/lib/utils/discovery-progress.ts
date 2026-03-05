/**
 * Computes discovery progress from messages for the progress bar.
 * Estimates total questions based on hub selection (Sales, Service, Marketing).
 */

import { deriveContextFromMessages } from "./derive-context-from-messages";

function parseActiveHubs(hubsText: string): { sales: boolean; marketing: boolean; service: boolean } {
  const text = String(hubsText || "").toLowerCase();
  const serviceExcluded = /service\s+(can\s+)?(come|wait|later|future|not\s+now)/i.test(text);
  const salesExcluded = /sales\s+(can\s+)?(come|wait|later)/i.test(text);
  const marketingExcluded = /marketing\s+(can\s+)?(come|wait|later)/i.test(text);
  return {
    sales: /\bsales\b/i.test(text) && !salesExcluded,
    marketing: /\bmarketing\b/i.test(text) && !marketingExcluded,
    service: /\bservice\b/i.test(text) && !serviceExcluded,
  };
}

/** Base steps: company (1a+1b), hubs, subscription, overall goals, hub-specific goals */
const BASE_STEPS = 5;

/** Approximate questions per hub block (from system prompt) */
const SALES_QUESTIONS = 4;
const SERVICE_QUESTIONS = 6;
const MARKETING_QUESTIONS = 6;

export type DiscoveryProgress = {
  completed: number;
  total: number;
  percentage: number;
  label: string;
  isComplete: boolean;
};

/**
 * Counts how many "question → user answer" pairs exist in the conversation.
 * Each time the user replies to an assistant message, that counts as one completed step.
 */
function countAnsweredPairs(messages: Array<{ role: string; content: string }>): number {
  let count = 0;
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    if (
      msg.role === "assistant" &&
      next.role === "user" &&
      msg.content.trim() &&
      next.content.trim()
    ) {
      count++;
    }
  }
  return count;
}

export function getDiscoveryProgress(
  messages: Array<{ role: string; content: string }>
): DiscoveryProgress {
  const { answersCollected } = deriveContextFromMessages(messages);
  // La barra se llena según las respuestas del usuario (cada par pregunta→respuesta cuenta)
  const completed = countAnsweredPairs(messages);

  // Estimate total: base + hub-specific (once we know hubs)
  const hubsText = answersCollected.hubs_included ?? "";
  const activeHubs = parseActiveHubs(hubsText);

  let total = BASE_STEPS;
  if (hubsText) {
    if (activeHubs.sales) total += SALES_QUESTIONS;
    if (activeHubs.service) total += SERVICE_QUESTIONS;
    if (activeHubs.marketing) total += MARKETING_QUESTIONS;
  } else {
    // Before hubs: use max so bar never shrinks (only ever fills)
    total = BASE_STEPS + SALES_QUESTIONS + SERVICE_QUESTIONS + MARKETING_QUESTIONS;
  }

  const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const isComplete = completed >= total;

  const label =
    completed === 0
      ? "Getting started…"
      : completed >= total
        ? "Discovery complete"
        : `~${Math.max(0, total - completed)} questions to go`;

  return {
    completed,
    total,
    percentage,
    label,
    isComplete,
  };
}
