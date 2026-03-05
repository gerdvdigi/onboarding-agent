import { validateOnboardingSession } from '@/lib/auth/validate-onboarding-session';
import { Step2Redirect } from '@/components/onboarding/Step2Redirect';

/**
 * Step-2 is deprecated: chat lives at /onboarding/conversations/[id].
 * This page redirects to the dashboard where users pick or create a conversation.
 */
export default async function Step2Page() {
  await validateOnboardingSession({ redirectToStep3IfPlanApproved: true });
  return <Step2Redirect />;
}
