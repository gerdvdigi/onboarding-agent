/**
 * Derives answersCollected and questionsAsked from the message history
 * so the backend can inject them into the agent prompt (no re-asking, better plan).
 * Keys align with discovery steps: company_info, hubs_included, plan_levels, overall_goals, etc.
 */

const LOWER = (s: string) => s.toLowerCase();

function topicFromAssistantQuestion(content: string): keyof typeof TOPIC_PATTERNS | null {
  const text = LOWER(content);
  for (const [topic, patterns] of Object.entries(TOPIC_PATTERNS)) {
    if (patterns.some((p) => text.includes(p))) return topic as keyof typeof TOPIC_PATTERNS;
  }
  return null;
}

const TOPIC_PATTERNS: Record<string, string[]> = {
  company_info: [
    "company's website", "domain", "business name", "what your business does",
    "what i understand about your business", "is this correct",
    "let's get started",
  ],
  hubs_included: [
    "which main hubspot hubs", "hubspot hubs are you planning",
    "marketing, sales, service", "planning to implement",
  ],
  // STEP 3 - Subscription levels (must NOT conflict with hub_specific_goals)
  subscription_levels: [
    "subscription level", "free, starter, professional, enterprise",
    "what subscription level", "hubs purchased that you're not planning",
  ],
  overall_goals: [
    "main goals with hubspot", "what are your main goals",
    "organize your sales", "send better emails", "improve reporting", "reduce manual work",
  ],
  // STEP 5 - Hub-specific goals (different patterns from subscription)
  hub_specific_goals: [
    "specific features you're excited", "goals you have in mind",
    "for each hub you're implementing", "excited to use, or goals",
  ],
  sales_process: [
    "let's talk sales", "who do you sell to", "sales team get their leads",
    "more than one sales team", "more than one sales process",
    "when is a deal created", "key steps your team takes", "what defines a 'won' deal",
    "pieces of info you always need to collect", "repetitive tasks",
  ],
  service_process: [
    "let's talk service", "service processes do you have",
    "when should a ticket be created", "main steps each ticket",
    "knowledge base in hubspot", "surveys",
  ],
  marketing_process: [
    "let's talk about your audience", "kinds of people or companies",
    "good lead for your business", "how are people finding you",
    "stay in touch or promote", "marketing campaigns outside",
    "content hub as part of",
  ],
  objectives: [
    "objectiv", "expect to achieve", "hoping to achieve",
  ],
  teamSize: [
    "how many people", "team size", "people on your team",
  ],
  industry: [
    "industry", "what industry", "sector", "type of business",
  ],
  budget: [
    "budget", "approximate budget", "investment",
  ],
  integrations: [
    "integration", "tools", "platforms", "connect with",
  ],
};

export type MessageLike = { role: string; content: string };

export function deriveContextFromMessages(
  messages: MessageLike[],
): { answersCollected: Record<string, string>; questionsAsked: string[] } {
  const answersCollected: Record<string, string> = {};
  const questionsAsked: string[] = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    if (msg.role !== "assistant" || next.role !== "user") continue;

    const question = msg.content.trim();
    const answer = next.content.trim();
    if (!question || !answer) continue;

    const topic = topicFromAssistantQuestion(question);
    if (topic && !answersCollected[topic]) {
      answersCollected[topic] = answer;
    }
    const shortened = question.length > 120 ? question.slice(0, 120).trim() + "…" : question;
    if (shortened && !questionsAsked.some((q) => q === shortened || q.startsWith(shortened.slice(0, 50)))) {
      questionsAsked.push(shortened);
    }
  }

  return { answersCollected, questionsAsked };
}
