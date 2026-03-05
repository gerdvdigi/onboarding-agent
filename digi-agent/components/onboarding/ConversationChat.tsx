"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ChatInterface = dynamic(
  () => import("./ChatInterface").then((m) => ({ default: m.ChatInterface })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  }
);

interface ConversationChatProps {
  conversationId: string;
}

export function ConversationChat({ conversationId }: ConversationChatProps) {
  return (
    <div className="min-h-screen bg-background">
      <section>
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8 flex items-center justify-between">

          <div className="mt-4 space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-heading">
              AI-Powered Discovery
            </h1>
            <p className="text-muted-foreground">
              Step 2 of 3 — Chat with our agent to create your personalized plan
            </p>
          </div>

            <Button variant="outline" size="sm" asChild className="ml-auto">
              <Link
                href="/onboarding/dashboard"
                className="inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>

        </div>
      </section>
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-card via-card to-muted/30 shadow-sm h-[calc(100vh-220px)]">
          <ChatInterface conversationId={conversationId} />
        </div>
      </div>
    </div>
  );
}
