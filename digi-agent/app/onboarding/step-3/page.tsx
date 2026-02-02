import { FinalizationStep } from "@/components/onboarding/FinalizationStep";
import { Progress } from "@/components/ui/progress";

export default function Step3Page() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Finalization</h1>
          <p className="text-muted-foreground">
            Step 3 of 3 - Your plan is ready
          </p>
        </div>

        <Progress value={100} className="h-2" />

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <FinalizationStep />
        </div>
      </div>
    </div>
  );
}
