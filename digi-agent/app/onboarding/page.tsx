import { Suspense } from "react";
import { OnboardingLanding } from "@/components/onboarding/OnboardingLanding";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <OnboardingLanding />
    </Suspense>
  );
}
