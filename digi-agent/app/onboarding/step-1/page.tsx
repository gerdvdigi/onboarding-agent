import { BasicInfoForm } from "@/components/onboarding/BasicInfoForm";
import { Progress } from "@/components/ui/progress";

export default function Step1Page() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Basic Information</h1>
          <p className="text-muted-foreground">
            Step 1 of 3 - Complete your details to get started
          </p>
        </div>

        <Progress value={33} className="h-2" />

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <BasicInfoForm />
        </div>
      </div>
    </div>
  );
}
