import { validateOnboardingSession } from '@/lib/auth/validate-onboarding-session';
import { SessionHydrator } from '@/components/onboarding/SessionHydrator';
import { FinalizationStep } from '@/components/onboarding/FinalizationStep';

export default async function Step3Page() {
  const session = await validateOnboardingSession({
    redirectToStep2IfNotPlanApproved: true,
  });

  return (
    <SessionHydrator userInfo={session.userInfo}>
      <div className="min-h-screen bg-background">
        <section className="border-b border-border bg-section-bg">
          <div className="mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-10">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-heading">
                Finalization
              </h1>
              <p className="text-muted-foreground">
                Step 3 of 3 — Your plan is ready
              </p>
            </div>
          </div>
        </section>
        <div className="mx-auto max-w-4xl p-4 md:p-8">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
            <FinalizationStep />
          </div>
        </div>
      </div>
    </SessionHydrator>
  );
}
