/**
 * Derives answersCollected and questionsAsked from the message history.
 * This runs in the backend, so we don't depend on the frontend sending correct data.
 * Keys align with the 5 pillars: company_info, hubs_included, subscription_levels, overall_goals, hub_specific_details.
 */

export interface MessageLike {
  role: string;
  content: string;
}

export interface DerivedContext {
  answersCollected: Record<string, string>;
  questionsAsked: string[];
}

/**
 * Patterns to detect which topic the assistant's question is about.
 * We use multiple patterns per topic to catch variations.
 */
const TOPIC_PATTERNS: Record<string, string[]> = {
  // STEP 1: Company info
  company_info: [
    "company's website",
    "domain",
    "business name",
    "what your business does",
    "what i understand about your business",
    "is this correct",
    "let's get started",
    "hi! let's get started",
  ],

  // STEP 2: Hubs
  hubs_included: [
    "hubspot hubs",
    "marketing, sales, service",
    "which main hubspot hubs",
    "planning to implement",
    "hubs are you",
  ],

  // STEP 3: Subscription levels
  subscription_levels: [
    "subscription level",
    "free, starter, professional, enterprise",
    "what subscription level",
    "hubs purchased",
    "not planning to implement right now",
  ],

  // STEP 4: Overall goals
  overall_goals: [
    "main goals with hubspot",
    "goals with hubspot",
    "what are your main goals",
    "organize your sales",
    "send better emails",
    "improve reporting",
    "reduce manual work",
  ],

  // STEP 5: Hub-specific goals (general)
  hub_specific_goals: [
    "specific features",
    "goals you have in mind",
    "excited to use",
    "for each hub you're implementing",
  ],

  // STEP 6A: Sales process
  sales_process: [
    "let's talk sales",
    "who do you sell to",
    "sales team get their leads",
    "more than one sales team",
    "more than one sales process",
    "when is a deal created",
    "key steps your team takes",
    "what defines a 'won' deal",
    "pieces of info you always need to collect",
    "repetitive tasks",
    "like to automate",
  ],

  // STEP 6B: Service process
  service_process: [
    "let's talk service",
    "service processes",
    "when should a ticket be created",
    "main steps each ticket",
    "knowledge base",
    "surveys",
    "customer satisfaction",
  ],

  // STEP 6C: Marketing process
  marketing_process: [
    "let's talk about your audience",
    "kinds of people or companies",
    "good lead for your business",
    "how are people finding you",
    "stay in touch or promote",
    "marketing campaigns",
    "content hub",
    "welcome email",
  ],
};

/**
 * Maps raw topics to the 5 pillars expected by the tools.
 */
const TOPIC_TO_PILLAR: Record<string, string> = {
  company_info: 'company_info',
  hubs_included: 'hubs_included',
  subscription_levels: 'subscription_levels',
  overall_goals: 'overall_goals',
  hub_specific_goals: 'hub_specific_details',
  sales_process: 'hub_specific_details',
  service_process: 'hub_specific_details',
  marketing_process: 'hub_specific_details',
};

function detectTopic(questionContent: string): string | null {
  const text = questionContent.toLowerCase();
  for (const [topic, patterns] of Object.entries(TOPIC_PATTERNS)) {
    if (patterns.some((p) => text.includes(p))) {
      return topic;
    }
  }
  return null;
}

/**
 * Derives answersCollected and questionsAsked from the message history.
 * For hub_specific_details, it accumulates all answers from sales/service/marketing process questions.
 */
export function deriveAnswersFromHistory(messages: MessageLike[]): DerivedContext {
  const rawAnswers: Record<string, string[]> = {};
  const questionsAsked: string[] = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];

    // Only process assistant question followed by user answer
    if (msg.role !== 'assistant' || next.role !== 'user') continue;

    const question = msg.content.trim();
    const answer = next.content.trim();
    if (!question || !answer) continue;

    // Skip very short answers that don't add value (e.g., "yes", "ok")
    const isShortConfirmation = answer.length < 10 && /^(yes|no|ok|okay|sure|correct|yep|nope|si|sí)$/i.test(answer.trim());

    const topic = detectTopic(question);
    if (topic) {
      const pillar = TOPIC_TO_PILLAR[topic] || topic;

      // For company_info, we want the actual company description, not just "yes"
      // If the question is "is this correct?" and answer is just "yes", skip storing
      if (pillar === 'company_info' && question.toLowerCase().includes('is this correct') && isShortConfirmation) {
        // Don't overwrite company_info with just "yes"
      } else if (!isShortConfirmation || pillar !== 'company_info') {
        if (!rawAnswers[pillar]) {
          rawAnswers[pillar] = [];
        }
        // Avoid duplicates
        if (!rawAnswers[pillar].includes(answer)) {
          rawAnswers[pillar].push(answer);
        }
      }
    }

    // Track questions asked
    const shortened = question.length > 120 ? question.slice(0, 120).trim() + '…' : question;
    if (!questionsAsked.some((q) => q === shortened || q.startsWith(shortened.slice(0, 50)))) {
      questionsAsked.push(shortened);
    }
  }

  // Convert arrays to strings (join multiple answers)
  const answersCollected: Record<string, string> = {};
  for (const [pillar, answers] of Object.entries(rawAnswers)) {
    if (answers.length === 1) {
      answersCollected[pillar] = answers[0];
    } else if (answers.length > 1) {
      // For hub_specific_details, join with separator
      answersCollected[pillar] = answers.join(' | ');
    }
  }

  return { answersCollected, questionsAsked };
}

/**
 * Merges backend-derived answers with any answers sent by the frontend.
 * Backend-derived answers take precedence if they have content.
 */
export function mergeAnswers(
  backendDerived: Record<string, string>,
  frontendSent?: Record<string, string> | null,
): Record<string, string> {
  const merged: Record<string, string> = { ...frontendSent };

  for (const [key, value] of Object.entries(backendDerived)) {
    // Backend value takes precedence if it has meaningful content
    if (value && value.trim().length > 0) {
      merged[key] = value;
    }
  }

  return merged;
}
