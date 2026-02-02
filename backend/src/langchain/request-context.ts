import type { ChatContext } from '../common/types/onboarding.types';

/**
 * Normalizes client-sent answersCollected to the pillar keys expected by
 * detect_plan_ready and generate_plan_draft (frontend may send plan_levels,
 * hub_specific_goals, sales_process, etc.).
 */
export function normalizeAnswersToPillars(
  raw?: Record<string, string | unknown> | null,
): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  const get = (k: string) => {
    const v = raw[k];
    return typeof v === 'string' ? v : v != null ? String(v) : '';
  };
  out.company_info = get('company_info') || '';
  out.hubs_included = get('hubs_included') || '';
  out.subscription_levels = get('subscription_levels') || get('plan_levels') || '';
  out.overall_goals = get('overall_goals') || '';
  const hubParts = [
    get('hub_specific_details'),
    get('hub_specific_goals'),
    get('sales_process'),
    get('service_process'),
    get('marketing_process'),
  ].filter(Boolean);
  out.hub_specific_details = hubParts.length > 0 ? hubParts.join(' | ') : '';
  return out;
}

export interface StoredOnboardingContext {
  answersCollected: Record<string, string>;
  questionsAsked: string[];
}

/** Request-scoped context so tools can read answersCollected when the LLM omits it. Set by the service before streaming, cleared when done. */
let currentOnboardingContext: StoredOnboardingContext | null = null;

export function setOnboardingRequestContext(context: ChatContext | undefined): void {
  const normalized = normalizeAnswersToPillars(context?.answersCollected);
  const hasAny = Object.values(normalized).some((v) => v.trim().length > 0);
  currentOnboardingContext = {
    answersCollected: hasAny ? normalized : {},
    questionsAsked: context?.questionsAsked ?? [],
  };
}

export function clearOnboardingRequestContext(): void {
  currentOnboardingContext = null;
}

export function getOnboardingRequestContext(): StoredOnboardingContext | undefined {
  return currentOnboardingContext ?? undefined;
}
