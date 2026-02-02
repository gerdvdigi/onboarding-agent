"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import type { ImplementationPlan } from "@/lib/langchain/agent";
import { API_ENDPOINTS } from "@/lib/config/api";
import { deriveContextFromMessages } from "@/lib/utils/derive-context-from-messages";
import { ChatMessageContent } from "./ChatMessageContent";

export function ChatInterface() {
  const { messages, addMessage, userInfo, context, updateContext } =
    useOnboardingStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [planDraft, setPlanDraft] = useState<ImplementationPlan | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const streamingCompleteRef = useRef(false);
  const finalStreamingContentRef = useRef<string>("");
  const isSendingRef = useRef(false);
  const streamingBufferRef = useRef<string>("");
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Initial agent message - once when there are no messages
  useEffect(() => {
    if (!hasInitializedRef.current && userInfo) {
      const currentMessages = useOnboardingStore.getState().messages;
      if (currentMessages.length === 0) {
        hasInitializedRef.current = true;
        setTimeout(() => {
          const store = useOnboardingStore.getState();
          if (store.messages.length === 0) {
            store.addMessage(
              "assistant",
              `👋 Hi! Let's get started. What's your company's website (domain)?\nIf you don't have one, you can tell me your business name and what your business does.`
            );
          }
        }, 0);
      }
    }
  }, [userInfo]);

  // Effect to add assistant message when streaming ends
  useEffect(() => {
    if (streamingCompleteRef.current && !isLoading) {
      const finalContent = finalStreamingContentRef.current;
      if (finalContent && finalContent.trim()) {
        streamingCompleteRef.current = false;
        const contentToSave = finalContent.trim();
        finalStreamingContentRef.current = "";

        const currentMessages = useOnboardingStore.getState().messages;
        const isDuplicate = currentMessages.some(
          (msg) => msg.role === "assistant" && msg.content.trim() === contentToSave
        );

        if (!isDuplicate) {
          addMessage("assistant", contentToSave);
        }
        setStreamingContent("");
      }
    }
  }, [isLoading, addMessage]);

  const performChatRequest = useCallback(async () => {
    const state = useOnboardingStore.getState();
    const { messages: updatedMessages, context: ctx, userInfo: u } = state;

    // Send full conversation so the backend knows what was already asked and answered
    const seenMessages = new Set<string>();
    const messagesToSend = updatedMessages
      .filter((m) => {
        const messageKey = `${m.role}:${m.content.trim()}`;
        if (seenMessages.has(messageKey)) return false;
        seenMessages.add(messageKey);
        return true;
      })
      .map((m) => ({ role: m.role, content: m.content }));

    if (messagesToSend.length === 0) return;

    const derived = deriveContextFromMessages(messagesToSend);
    const answersCollected =
      Object.keys(derived.answersCollected).length > 0
        ? derived.answersCollected
        : ctx.answersCollected;
    const questionsAsked =
      derived.questionsAsked.length > 0 ? derived.questionsAsked : ctx.questionsAsked;
    const contextToSend = {
      ...ctx,
      answersCollected,
      questionsAsked,
      planReady: ctx.planReady || Object.keys(answersCollected).length >= 4,
    };

    isSendingRef.current = true;
    setIsLoading(true);
    setStreamingContent("");
    streamingCompleteRef.current = false;
    finalStreamingContentRef.current = "";

    try {
      const response = await fetch(API_ENDPOINTS.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesToSend,
          userInfo: u,
          context: contextToSend,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        let detail = body;
        try {
          const parsed = JSON.parse(body);
          detail = parsed.message || parsed.error || body;
        } catch {
          // use raw body as detail
        }
        console.error("[Chat] Server error:", response.status, detail);
        throw new Error(detail || `Server error (${response.status})`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        throw new Error("Could not get stream");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "agent" || data.type === "message") {
                const content = data.content || "";
                // Buffer content and flush periodically to avoid rendering broken markdown
                streamingBufferRef.current += content;
                finalStreamingContentRef.current += content;

                // Clear existing timeout
                if (flushTimeoutRef.current) {
                  clearTimeout(flushTimeoutRef.current);
                }

                // Flush buffer every 50ms or when we have a complete line/sentence
                const shouldFlushNow =
                  streamingBufferRef.current.includes("\n\n") ||
                  streamingBufferRef.current.endsWith(". ") ||
                  streamingBufferRef.current.endsWith(":\n") ||
                  streamingBufferRef.current.length > 100;

                // Helper to fix "Hub Spot" -> "HubSpot" before rendering
                const fixHubSpot = (text: string) => text.replace(/Hub[\s\n]+Spot/gi, "HubSpot");

                if (shouldFlushNow) {
                  setStreamingContent(fixHubSpot(finalStreamingContentRef.current));
                  streamingBufferRef.current = "";
                } else {
                  flushTimeoutRef.current = setTimeout(() => {
                    setStreamingContent(fixHubSpot(finalStreamingContentRef.current));
                    streamingBufferRef.current = "";
                  }, 50);
                }
              } else if (data.type === "plan_generated" && data.plan) {
                setPlanDraft(data.plan);
                updateContext({
                  step: "plan-review",
                  planDraft: data.plan,
                  planReady: true,
                });
              } else if (data.type === "plan_check") {
                updateContext({ planReady: data.ready });
              } else if (data.type === "end") {
                // Clear any pending flush timeout
                if (flushTimeoutRef.current) {
                  clearTimeout(flushTimeoutRef.current);
                  flushTimeoutRef.current = null;
                }
                // Final flush of any remaining buffered content
                // Also fix "Hub Spot" -> "HubSpot"
                const fixHubSpot = (text: string) => text.replace(/Hub[\s\n]+Spot/gi, "HubSpot");
                const finalContent = fixHubSpot(finalStreamingContentRef.current || "");
                if (finalContent.trim()) {
                  setStreamingContent(finalContent);
                  finalStreamingContentRef.current = finalContent;
                  streamingCompleteRef.current = true;
                }
                streamingBufferRef.current = "";
                setIsLoading(false);
                isSendingRef.current = false;
              } else if (data.type === "error") {
                // Clear buffer and timeout on error
                if (flushTimeoutRef.current) {
                  clearTimeout(flushTimeoutRef.current);
                  flushTimeoutRef.current = null;
                }
                streamingBufferRef.current = "";
                finalStreamingContentRef.current = "";
                const errorMessage = data.error || "Unknown error";
                setIsLoading(false);
                setStreamingContent("");
                isSendingRef.current = false;
                setTimeout(() => {
                  addMessage(
                    "assistant",
                    `Sorry, there was an error: ${errorMessage}. Please try again.`
                  );
                }, 0);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      // Clear buffer and timeout on error
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      streamingBufferRef.current = "";
      finalStreamingContentRef.current = "";
      setIsLoading(false);
      isSendingRef.current = false;
      setTimeout(() => {
        addMessage(
          "assistant",
          "Sorry, there was an error processing your message. Please try again."
        );
      }, 0);
    }
  }, [addMessage, updateContext]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || isSendingRef.current) return;

    const userMessage = input.trim();

    const currentMessages = useOnboardingStore.getState().messages;
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (
      lastMessage &&
      lastMessage.role === "user" &&
      lastMessage.content.trim() === userMessage
    ) {
      return;
    }

    isSendingRef.current = true;
    setInput("");
    addMessage("user", userMessage);
    await performChatRequest();
  }, [input, isLoading, addMessage, performChatRequest]);

  const handleApprovePlan = () => {
    if (planDraft) {
      const messages = useOnboardingStore.getState().messages;
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const fullPlanText = lastAssistant?.content ?? null;
      useOnboardingStore.getState().setApprovedPlan(planDraft, fullPlanText);
      useOnboardingStore.getState().setCurrentStep(3);
      window.location.href = "/onboarding/step-3";
    }
  };

  const [showChangesInput, setShowChangesInput] = useState(false);
  const [changesInput, setChangesInput] = useState("");

  const handleRequestChanges = useCallback(() => {
    setShowChangesInput(true);
  }, []);

  const handleSubmitChanges = useCallback(() => {
    if (!changesInput.trim()) return;
    
    setPlanDraft(null);
    setShowChangesInput(false);
    updateContext({ step: "plan-review", planReady: true });
    addMessage(
      "user",
      `I'd like to request some changes to the plan:\n\n${changesInput.trim()}`
    );
    setChangesInput("");
    performChatRequest();
  }, [changesInput, addMessage, updateContext, performChatRequest]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <ChatMessageContent content={msg.content} />
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
              <ChatMessageContent content={streamingContent} />
            </div>
          </div>
        )}

        {planDraft && !showChangesInput && (
          <div className="flex gap-2">
            <Button onClick={handleApprovePlan} className="flex-1" disabled={isLoading}>
              ✅ Approve Plan
            </Button>
            <Button
              onClick={handleRequestChanges}
              disabled={isLoading}
              className="flex-1 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              ✏️ Request Changes
            </Button>
          </div>
        )}

        {showChangesInput && (
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium">What would you like to change?</p>
            <textarea
              value={changesInput}
              onChange={(e) => setChangesInput(e.target.value)}
              placeholder="E.g., Add more automation workflows, change pipeline stages, include Service Hub..."
              className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleSubmitChanges} 
                disabled={isLoading || !changesInput.trim()}
                className="flex-1"
              >
                Submit Changes
              </Button>
              <Button
                onClick={() => {
                  setShowChangesInput(false);
                  setChangesInput("");
                }}
                disabled={isLoading}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {isLoading && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
