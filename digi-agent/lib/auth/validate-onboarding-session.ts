/**
 * Server-side session validation for onboarding routes.
 * Redirects if session is invalid or stage-based redirect applies.
 */

import { headers, redirect } from 'next/headers';
import { fetchSessionMe } from '@/lib/api/session-me';
import type { UserInfo } from '@/lib/langchain/agent';

const STAGES_BEYOND_DISCOVERY = ['plan_approved', 'pdf_downloaded'];

export interface ValidatedSession {
  userInfo: UserInfo;
  onboardingStage?: string;
}

export interface ValidateOptions {
  /** Redirect to step-3 when user already approved plan */
  redirectToStep3IfPlanApproved?: boolean;
  /** Redirect to dashboard when user has not approved plan yet (for step-3 page) */
  redirectToStep2IfNotPlanApproved?: boolean;
}

/**
 * Validates onboarding session. Redirects if invalid or stage-based redirect applies.
 * Call from Server Components in onboarding routes.
 */
export async function validateOnboardingSession(
  options: ValidateOptions = {}
): Promise<ValidatedSession> {
  const headersList = await headers();
  const cookie = headersList.get('cookie');
  const session = await fetchSessionMe(cookie);

  if (!session.ok || !session.userInfo) {
    redirect('/onboarding/step-1');
  }

  const stageBeyond =
    session.onboardingStage &&
    STAGES_BEYOND_DISCOVERY.includes(session.onboardingStage);

  if (options.redirectToStep3IfPlanApproved && stageBeyond) {
    redirect('/onboarding/step-3');
  }

  if (options.redirectToStep2IfNotPlanApproved && !stageBeyond) {
    redirect('/onboarding/dashboard');
  }

  return {
    userInfo: { ...session.userInfo, terms: true },
    onboardingStage: session.onboardingStage,
  };
}
