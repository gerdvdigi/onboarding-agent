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

function recommendModules(answers: any) {
  const activeHubs = parseActiveHubs(answers.hubs_included || '');
  const level = parseSubscriptionLevel(answers.subscription_levels);
  const modules: any[] = [];

  modules.push({
    name: 'HubSpot Framework & Data Architecture',
    description: 'Core configuration of custom properties, object associations, and security settings.',
    priority: 'high',
  });

  if (activeHubs.sales) {
    modules.push({
      name: 'Sales Automation & Pipeline Setup',
      description: `Designing custom deal stages, automated task creation, and sales sequences for ${level} users.`,
      priority: 'high',
    });
  }

  if (activeHubs.marketing) {
    modules.push({
      name: 'Inbound Marketing & Lead Nurturing',
      description: 'Advanced lead scoring, automated email workflows, and marketing asset branding.',
      priority: 'high',
    });
  }

  if (activeHubs.service) {
    modules.push({
      name: 'Service Excellence & Ticketing',
      description: 'Customer portal setup, automated ticket routing, and feedback survey implementation.',
      priority: 'medium',
    });
  }

  return modules;
}

function extractObjectives(answers: any): string[] {
  const goalsText = String(answers.overall_goals || answers.business_goals || '').toLowerCase();
  const objectives: string[] = [];

  const objectivePatterns: Array<{ pattern: RegExp | string; objective: string }> = [
    { pattern: /organiz(e|ing)\s*(the\s*)?(sales|process)/i, objective: 'Organize and standardize the sales process end-to-end' },
    { pattern: /reduce\s*manual/i, objective: 'Reduce manual work through automation' },
    { pattern: /no\s*(lead|leads?)\s*(slip|fall|miss)/i, objective: 'Ensure no leads slip through the cracks' },
    { pattern: /lead\s*qualif/i, objective: 'Improve lead qualification and scoring' },
    { pattern: /faster\s*follow/i, objective: 'Enable faster follow-up with leads and deals' },
    { pattern: /pipeline\s*visib/i, objective: 'Achieve clear pipeline visibility' },
    { pattern: /report/i, objective: 'Implement reliable reporting and dashboards' },
    { pattern: /marketing.*feeds?\s*sales/i, objective: 'Align marketing to feed sales with qualified opportunities' },
    { pattern: /automat/i, objective: 'Automate repetitive tasks and workflows' },
    { pattern: /track.*source|source.*track|roi/i, objective: 'Track lead sources and measure ROI by channel' },
    { pattern: /nurtur/i, objective: 'Set up lead nurturing sequences' },
    { pattern: /scal(e|ing)/i, objective: 'Scale operations without adding headcount' },
  ];

  for (const { pattern, objective } of objectivePatterns) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    if (regex.test(goalsText) && !objectives.includes(objective)) {
      objectives.push(objective);
    }
  }

  if (objectives.length === 0) {
    const activeHubs = parseActiveHubs(answers.hubs_included || '');
    if (activeHubs.sales) objectives.push('Optimize sales operations with HubSpot');
    if (activeHubs.marketing) objectives.push('Streamline marketing automation and lead generation');
    if (activeHubs.service) objectives.push('Improve customer service efficiency');
    if (objectives.length === 0) {
      objectives.push('Optimize business operations through HubSpot automation');
    }
  }

  return objectives.slice(0, 5);
}

function estimateTimeline(modules: any[]): string {
  const highPriorityItems = modules.filter(m => m.priority === 'high').length;
  const estimatedWeeks = 2 + highPriorityItems;
  return `${estimatedWeeks} weeks`;
}

function generateRecommendations(answers: any): string[] {
  const recommendations: string[] = [
    'Define clear naming conventions for all technical assets.',
    'Integrate primary calendars and email inboxes for data tracking.',
  ];

  const activeHubs = parseActiveHubs(answers.hubs_included || '');

  if (activeHubs.sales) {
    recommendations.push('Set up deal pipelines before importing historical data.');
    recommendations.push('Configure lead assignment rules based on territory or round-robin.');
  }

  if (activeHubs.marketing) {
    recommendations.push('Install tracking code on all website pages before launching campaigns.');
    recommendations.push('Define lifecycle stages and lead scoring criteria early.');
  }

  if (activeHubs.service) {
    recommendations.push('Map ticket statuses to your actual support workflow.');
    recommendations.push('Set up SLA automation for response time tracking.');
  }

  return recommendations;
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
