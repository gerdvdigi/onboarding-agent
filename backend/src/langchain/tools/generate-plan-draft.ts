import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ImplementationPlan } from '../../common/types/onboarding.types';
import { getOnboardingRequestContext } from '../request-context';

let planGeneratedListener: ((plan: ImplementationPlan) => void) | null = null;

export function setPlanGeneratedListener(
  fn: ((plan: ImplementationPlan) => void) | null,
): void {
  planGeneratedListener = fn;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Parses which Hubs are ACTIVELY being implemented.
 * Distinguishes "Sales and Marketing" from "Service can come later".
 */
function parseActiveHubs(hubsText: string): { sales: boolean; marketing: boolean; service: boolean } {
  const text = String(hubsText || '').toLowerCase();
  
  const excludePatterns = [
    /service\s+(can\s+)?(come|wait|later|future|not\s+now|isn't|not\s+in\s+scope)/i,
    /not\s+(planning|implementing|including)\s+.*?service/i,
    /marketing\s+(can\s+)?(come|wait|later|future|not\s+now)/i,
    /sales\s+(can\s+)?(come|wait|later|future|not\s+now)/i,
  ];
  
  const hasSales = /\bsales\b/i.test(text);
  const hasMarketing = /\bmarketing\b/i.test(text);
  const hasService = /\bservice\b/i.test(text);
  
  const serviceExcluded = excludePatterns.some(p => p.test(text));
  const salesExcluded = /sales\s+(can\s+)?(come|wait|later|not\s+now)/i.test(text);
  const marketingExcluded = /marketing\s+(can\s+)?(come|wait|later|not\s+now)/i.test(text);
  
  return {
    sales: hasSales && !salesExcluded,
    marketing: hasMarketing && !marketingExcluded,
    service: hasService && !serviceExcluded,
  };
}

const VALID_LEVELS = ['free', 'starter', 'professional', 'enterprise'];

function parseSubscriptionLevel(raw: string): string {
  const s = String(raw || '').toLowerCase().trim();
  if (s.length > 50) return 'Professional';
  const found = VALID_LEVELS.find((l) => s.includes(l));
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : 'Professional';
}

function recommendModules(_answers: any): any[] {
  return [];
}

function extractObjectives(answers: Record<string, unknown>): string[] {
  const objectives: string[] = [];
  const overall = String(answers.overall_goals || '').trim();
  const hubSpecific = String(answers.hub_specific_details || '').trim();

  if (overall) {
    // Split by common separators: comma, semicolon, "and", newlines
    const parts = overall
      .split(/[,;]|\s+and\s+|\n+/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && s.length < 200);
    objectives.push(...parts);
  }

  if (hubSpecific) {
    const parts = hubSpecific
      .split(/\||[,;]|\s+and\s+|\n+/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && s.length < 200);
    for (const p of parts) {
      if (p && !objectives.some((o) => o.toLowerCase() === p.toLowerCase())) {
        objectives.push(p);
      }
    }
  }

  return objectives.slice(0, 12);
}

function estimateTimeline(_modules: any[]): string {
  return '';
}

function generateRecommendations(_answers: any): string[] {
  return [];
}

// ═══════════════════════════════════════════════════════════════
// TOOL DEFINITION
// ═══════════════════════════════════════════════════════════════

const GeneratePlanDraftSchema = z.object({
  companyName: z.string().describe('The name of the company'),
  website: z.string().describe('Company website URL'),
  email: z.string().describe('User contact email'),
  knowledgeContext: z.string().describe('Technical insights retrieved from the RAG search'),
  answersCollected: z
    .record(z.string(), z.any())
    .optional()
    .describe('The full set of discovery data (company_info, hubs_included, subscription_levels, overall_goals, hub_specific_details).'),
});

export const generatePlanDraftTool = tool(
  async (input: z.infer<typeof GeneratePlanDraftSchema>): Promise<string> => {
    const { companyName, knowledgeContext } = input;
    const requestCtx = getOnboardingRequestContext();
    const answersCollected =
      input.answersCollected && Object.keys(input.answersCollected).length > 0
        ? input.answersCollected
        : requestCtx?.answersCollected ?? {};

    console.log('[generate_plan_draft] Building plan for:', companyName);
    console.log('[generate_plan_draft] Hubs:', answersCollected.hubs_included?.substring(0, 80));

    // ═══════════════════════════════════════════════════════════════
    // BUILD STRUCTURED PLAN (for frontend card only)
    // ═══════════════════════════════════════════════════════════════
    const modules = recommendModules(answersCollected);
    const objectives = extractObjectives(answersCollected);
    const activeHubs = parseActiveHubs(answersCollected.hubs_included || '');

    const plan: ImplementationPlan = {
      company: companyName,
      objectives: objectives,
      modules: modules,
      timeline: estimateTimeline(modules),
      recommendations: generateRecommendations(answersCollected),
    };

    console.log('[generate_plan_draft] Plan metadata created:', {
      company: plan.company,
      modulesCount: plan.modules.length,
      objectivesCount: plan.objectives.length,
      timeline: plan.timeline,
      activeHubs,
    });

    // Emit event for frontend (structured card)
    if (planGeneratedListener) planGeneratedListener(plan);

    // ═══════════════════════════════════════════════════════════════
    // BUILD CONTEXT SUMMARY FOR LLM (INTERNAL USE ONLY)
    // ═══════════════════════════════════════════════════════════════
    const hubsList: string[] = [];
    if (activeHubs.sales) hubsList.push('Sales Hub');
    if (activeHubs.marketing) hubsList.push('Marketing Hub');
    if (activeHubs.service) hubsList.push('Service Hub');

    // Return a simple success message - the LLM should use the system prompt format
    // All the context is already in the conversation history
    return JSON.stringify({
      status: 'ready',
      company: companyName,
      activeHubs: hubsList,
      subscriptionLevel: parseSubscriptionLevel(answersCollected.subscription_levels),
      objectives: objectives,
      timeline: plan.timeline,
      ragContext: knowledgeContext ? 'Available - use format from knowledge base' : 'Not available - use system prompt format',
      instruction: 'Generate the Implementation Plan now using the PHASE 2 format from your system prompt. Do NOT output this message to the user.'
    });
  },
  {
    name: 'generate_plan_draft',
    description:
      'Prepares context for generating the Implementation Plan. Returns discovery data summary and RAG guidance. ' +
      'After calling this tool, YOU must generate the full Implementation Plan in your response using the format from the knowledge base.',
    schema: GeneratePlanDraftSchema,
  },
);
