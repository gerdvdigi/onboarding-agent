import { ChatInterface } from "@/components/onboarding/ChatInterface";
import { Progress } from "@/components/ui/progress";

export default function Step2Page() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">AI-Powered Discovery</h1>
          <p className="text-muted-foreground">
            Step 2 of 3 - Chat with our agent to create your personalized plan
          </p>
        </div>

        <Progress value={66} className="h-2" />

        <div className="rounded-lg border bg-card shadow-sm h-[calc(100vh-250px)]">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
