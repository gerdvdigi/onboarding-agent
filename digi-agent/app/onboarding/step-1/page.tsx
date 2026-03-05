import { BasicInfoForm } from "@/components/onboarding/BasicInfoForm";
import { Step1Guard } from "@/components/onboarding/Step1Guard";

export default function Step1Page() {
  return (
    <Step1Guard>
    <div className="min-h-screen bg-background">
      <section >
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-heading">
              Basic Information
            </h1>
            <p className="text-muted-foreground">
              Step 1 of 3 — Complete your details to get started
            </p>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
          <BasicInfoForm />
        </div>
      </div>
    </div>
    </Step1Guard>
  );
}
