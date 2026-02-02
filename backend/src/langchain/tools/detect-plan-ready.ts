import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getOnboardingRequestContext } from '../request-context';

/**
 * Input schema for the readiness detector.
 * All keys and descriptions are in English to match the Agent's reasoning.
 */
const DetectPlanReadySchema = z.object({
  questionsAsked: z.array(z.string()).optional().describe('List of questions already asked by the agent'),
  answersCollected: z.record(z.string(), z.any()).optional().describe('Data points gathered from the user'),
  planReady: z.boolean().optional().describe('Current flag state'),
});

/**
 * Critical pillars for a HubSpot Implementation Plan.
 * The agent must collect data points that match these English keys.
 */
const REQUIRED_PILLARS = [
  'company_info',          // Industry, business model, size
  'hubs_included',         // Sales, Marketing, Service, etc.
  'subscription_levels',   // Starter, Pro, Enterprise
  'overall_goals',         // Business KPIs and objectives
  'hub_specific_details'   // Deep dive into pipelines or specific features
];

/**
 * Parses which Hubs are ACTIVELY being implemented (not just mentioned).
 * "Service can come later" = NOT active
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

/**
 * Checks if Hub-specific discovery questions have been asked.
 * Uses flexible patterns that work with emoji prefixes and truncated questions.
 */
function checkHubQuestionsAsked(
  questions: string[],
  activeHubs: { sales: boolean; marketing: boolean; service: boolean }
): { complete: boolean; missingHubQuestions: string[] } {
  const allQuestionsText = questions.join(' ').toLowerCase();
  const missingHubQuestions: string[] = [];

  console.log('[detect_plan_ready] Questions count:', questions.length);
  console.log('[detect_plan_ready] Questions text (first 500 chars):', allQuestionsText.slice(0, 500));
  console.log('[detect_plan_ready] Active hubs:', activeHubs);

  // STEP 6A: Sales questions (at least 3 key patterns)
  if (activeHubs.sales) {
    const salesPatterns = [
      /let.?s talk sales|who do you sell|sell to\?/i,
      /more than one sales|sales team|sales process/i,
      /deal.*created|when is a deal|deal is created/i,
      /repetitive tasks|automate|pieces of info/i,
    ];
    const salesMatches = salesPatterns.map(p => p.test(allQuestionsText));
    const salesQuestionsFound = salesMatches.filter(Boolean).length;
    console.log('[detect_plan_ready] Sales patterns matched:', salesQuestionsFound, salesMatches);
    if (salesQuestionsFound < 3) {
      missingHubQuestions.push(`STEP 6A (Sales) incomplete: ${salesQuestionsFound}/3 patterns matched`);
    }
  }

  // STEP 6B: Service questions (at least 3 key patterns)
  if (activeHubs.service) {
    const servicePatterns = [
      /let.?s talk service|service processes/i,
      /ticket.*created|when should a ticket/i,
      /steps.*ticket|ticket.*through/i,
      /knowledge base|surveys/i,
    ];
    const serviceMatches = servicePatterns.map(p => p.test(allQuestionsText));
    const serviceQuestionsFound = serviceMatches.filter(Boolean).length;
    console.log('[detect_plan_ready] Service patterns matched:', serviceQuestionsFound, serviceMatches);
    if (serviceQuestionsFound < 3) {
      missingHubQuestions.push(`STEP 6B (Service) incomplete: ${serviceQuestionsFound}/3 patterns matched`);
    }
  }

  // STEP 6C: Marketing questions (at least 4 key patterns)
  if (activeHubs.marketing) {
    const marketingPatterns = [
      /talk about your audience|kinds of people|what kinds/i,
      /good lead|makes someone.*lead|lead for your business/i,
      /people finding you|finding you right now|how are people/i,
      /stay in touch|promote your business|currently stay/i,
      /marketing campaigns|campaigns outside|set up any/i,
      /content hub/i,
    ];
    const marketingMatches = marketingPatterns.map(p => p.test(allQuestionsText));
    const marketingQuestionsFound = marketingMatches.filter(Boolean).length;
    console.log('[detect_plan_ready] Marketing patterns matched:', marketingQuestionsFound, marketingMatches);
    if (marketingQuestionsFound < 4) {
      missingHubQuestions.push(`STEP 6C (Marketing) incomplete: ${marketingQuestionsFound}/4 patterns matched`);
    }
  }

  return {
    complete: missingHubQuestions.length === 0,
    missingHubQuestions,
  };
}

export const detectPlanReadyTool = tool(
  async (input: z.infer<typeof DetectPlanReadySchema>) => {
    const requestCtx = getOnboardingRequestContext();
    
    // ALWAYS use backend-derived context - LLM passes step labels like "6A1" instead of actual text
    // The backend derives the actual question text from message history
    const answers = requestCtx?.answersCollected ?? {};
    const history = requestCtx?.questionsAsked ?? [];

    console.log('[detect_plan_ready] Using backend context:');
    console.log('[detect_plan_ready] - Questions count:', history.length);
    console.log('[detect_plan_ready] - Answers keys:', Object.keys(answers));
    console.log('[detect_plan_ready] - First 3 questions:', history.slice(0, 3).map(q => q.substring(0, 50)));

    const collectedKeys = Object.keys(answers).map((k) => k.toLowerCase());

    // Check which pillars are missing based on the answersCollected keys
    const missingPillars = REQUIRED_PILLARS.filter(
      (pillar) => !collectedKeys.some((key) => key.includes(pillar))
    );

    // Parse which Hubs are being implemented
    const hubsText = answers.hubs_included || '';
    const activeHubs = parseActiveHubs(hubsText);
    
    // Check if Hub-specific questions have been asked
    const hubQuestionsCheck = checkHubQuestionsAsked(history, activeHubs);

    // Calculate completion confidence
    const basePillarConfidence = Math.round(
      ((REQUIRED_PILLARS.length - missingPillars.length) / REQUIRED_PILLARS.length) * 100
    );
    // Reduce confidence if hub questions are incomplete
    const confidence = hubQuestionsCheck.complete ? basePillarConfidence : Math.min(basePillarConfidence, 70);

    /**
     * Readiness Logic:
     * 1. All pillars must be present.
     * 2. The agent must have engaged in at least 4 turns (questionsAsked).
     * 3. At least 5 distinct data points must be stored.
     * 4. NEW: Hub-specific questions must be complete for ALL active Hubs.
     */
    const isReady = 
      missingPillars.length === 0 && 
      history.length >= 4 && 
      Object.keys(answers).length >= 5 &&
      hubQuestionsCheck.complete;

    // Combine missing info
    const allMissing = [
      ...missingPillars,
      ...hubQuestionsCheck.missingHubQuestions,
    ];

    console.log('[detect_plan_ready] Active Hubs:', activeHubs);
    console.log('[detect_plan_ready] Hub questions check:', hubQuestionsCheck);
    console.log('[detect_plan_ready] Ready:', isReady);

    return {
      ready: isReady,
      missing: allMissing,
      confidence: confidence,
      activeHubs: activeHubs,
      metrics: {
        totalQuestions: history.length,
        totalDataPoints: Object.keys(answers).length,
        hubQuestionsComplete: hubQuestionsCheck.complete,
        status: isReady ? 'Ready for RAG and Generation' : 'More discovery needed'
      }
    };
  },
  {
    name: 'detect_plan_ready',
    description: 'Analyzes if the discovery phase is complete. Checks for: company_info, hubs_included, subscription_levels, overall_goals, hub_specific_details, AND verifies that Hub-specific questions (6A/6B/6C) have been asked for all selected Hubs.',
    schema: DetectPlanReadySchema,
  }
);