"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import { getApiBaseUrl, getAuthFetchOptions } from "@/lib/config/api";
import type { ImplementationPlan } from "@/lib/langchain/agent";

import { deriveContextFromMessages } from "@/lib/utils/derive-context-from-messages";
import { getDiscoveryProgress } from "@/lib/utils/discovery-progress";
import { ChatMessageContent } from "./ChatMessageContent";
import { DiscoveryProgressBar } from "./DiscoveryProgressBar";
import { MessageBubbleSkeleton } from "./MessageBubbleSkeleton";
import { TypingIndicator } from "./TypingIndicator";

interface ChatInterfaceProps {
  conversationId: string;
}

export function ChatInterface({ conversationId }: ChatInterfaceProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { messages, addMessage, setMessages, userInfo, updateContext } =
    useOnboardingStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [planDraft, setPlanDraft] = useState<ImplementationPlan | null>(null);
  const [lastTokenUsage, setLastTokenUsage] = useState<{
    openai: { promptTokens: number; completionTokens: number; totalTokens: number };
    cohere: { inputTokens: number };
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitializedRef = useRef(false);
  const streamingCompleteRef = useRef(false);
  const finalStreamingContentRef = useRef<string>("");
  const isSendingRef = useRef(false);
  const streamingBufferRef = useRef<string>("");
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showChangesInput, setShowChangesInput] = useState(false);
  const [changesInput, setChangesInput] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-resize textarea (ChatGPT-style)
  const adjustInputHeight = useCallback(() => {
    const el = inputTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 44), 200);
    el.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustInputHeight();
  }, [input, adjustInputHeight]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Load conversation history from DB
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  useEffect(() => {
    setMessagesLoaded(false);
    setMessages([]);
    let cancelled = false;
    const url = `${getApiBaseUrl()}/chat/messages?conversationId=${encodeURIComponent(conversationId)}`;
    getAuthFetchOptions(getToken)
      .then((opts) => fetch(url, { ...opts }))
      .then((res) => {
        if (cancelled) return null;
        if (res.status === 404) {
          router.replace("/onboarding/dashboard");
          return null;
        }
        return res.ok ? res.json() : { messages: [] };
      })
      .then((data) => {
        if (cancelled || data === null) return;
        const list = Array.isArray(data.messages) ? data.messages : [];
        if (list.length > 0) {
          setMessages(
            list.map((m: { role: string; content: string; timestamp?: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
            }))
          );
        }
        setMessagesLoaded(true);
      })
      .catch(() => setMessagesLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [conversationId, setMessages, router, getToken]);

  // Initial agent message - once when there are no messages (after load from DB)
  useEffect(() => {
    if (!hasInitializedRef.current && userInfo && messagesLoaded) {
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
  }, [userInfo, messagesLoaded]);

  // Effect to add assistant message when streaming ends
  useEffect(() => {
    if (streamingCompleteRef.current && !isLoading) {
      const finalContent = finalStreamingContentRef.current;
      if (finalContent && finalContent.trim()) {
        streamingCompleteRef.current = false;
        const contentToSave = finalContent.trim();
        finalStreamingContentRef.current = "";

        const currentMessages = useOnboardingStore.getState().messages;
        // Solo evitar duplicado si el último mensaje ya es esta misma respuesta (evita doble add por re-render del effect)
        const lastMsg = currentMessages[currentMessages.length - 1];
        const isDuplicate =
          lastMsg?.role === "assistant" && lastMsg.content.trim() === contentToSave;

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

    if (!u) {
      console.warn("[Chat] userInfo is required.");
      throw new Error("Session not loaded. Please refresh the page.");
    }

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
      const opts = await getAuthFetchOptions(getToken);
      const response = await fetch(`${getApiBaseUrl()}/chat`, {
        method: "POST",
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers as Record<string, string>),
        },
        body: JSON.stringify({
          conversationId,
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
              } else if (data.type === "token_usage" && data.usage) {
                setLastTokenUsage(data.usage);
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
  }, [conversationId, addMessage, updateContext]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || isSendingRef.current) return;

    const userMessage = input.trim();
    if (!userInfo) {
      addMessage(
        "assistant",
        "Session not loaded. Please refresh the page."
      );
      return;
    }

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
    try {
      await performChatRequest();
    } finally {
      isSendingRef.current = false;
    }
  }, [input, isLoading, userInfo, addMessage, performChatRequest]);

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

  const handleApprovePlan = async () => {
    if (!planDraft) return;
    const state = useOnboardingStore.getState();
    const messages = state.messages;
    const ctx = state.context;
    const derived = deriveContextFromMessages(
      messages.map((m) => ({ role: m.role, content: m.content }))
    );
    const answersCollected =
      Object.keys(derived.answersCollected).length > 0
        ? derived.answersCollected
        : ctx.answersCollected;
    const { percentage } = getDiscoveryProgress(
      messages.map((m) => ({ role: m.role, content: m.content }))
    );
    const planMarkers = /##\s+(SALES|MARKETING|SERVICE)\s+HUB|#\s+.+\s+Implementation\s+Plan/i;
    const assistantMessages = [...messages].filter((m) => m.role === "assistant");
    const planMessage = [...assistantMessages].reverse().find(
      (m) => m.content && planMarkers.test(m.content)
    );
    const fullPlanText = (planMessage?.content ?? assistantMessages.at(-1)?.content ?? "").trim() || null;
    try {
      const opts = await getAuthFetchOptions(getToken);
      await fetch(`${getApiBaseUrl()}/onboarding/plan-approved`, {
        method: "POST",
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers as Record<string, string>),
        },
        body: JSON.stringify({
          plan: planDraft,
          conversationId,
          answersCollected: Object.keys(answersCollected).length > 0 ? answersCollected : undefined,
          discoveryPercentage: percentage,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
    } catch {
      // No bloquear navegación si falla la sincronización con HubSpot
    }
    useOnboardingStore.getState().setApprovedPlan(planDraft, fullPlanText, conversationId);
    useOnboardingStore.getState().setCurrentStep(3);
    window.location.href = "/onboarding/step-3";
  };

  return (
    <div className="flex h-full flex-col">
      <DiscoveryProgressBar
        messages={messages}
        hidden={!!planDraft}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!messagesLoaded ? (
          <>
            <MessageBubbleSkeleton role="assistant" lines={3} />
            <MessageBubbleSkeleton role="user" lines={2} />
            <MessageBubbleSkeleton role="assistant" lines={2} />
          </>
        ) : (
          <>
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
              <ChatMessageContent content={msg.content} isUserMessage={msg.role === "user"} />
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
              <ChatMessageContent content={streamingContent} isUserMessage={false} />
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
              variant="outline"
              className="flex-1"
            >
              ✏️ Request Changes
            </Button>
          </div>
        )}

        {showChangesInput && (
          <div className="space-y-3 rounded-xl border border-border bg-section-bg/50 p-4">
            <p className="text-sm font-medium">What would you like to change?</p>
            <textarea
              value={changesInput}
              onChange={(e) => setChangesInput(e.target.value)}
              placeholder="E.g., Add more automation workflows, change pipeline stages, include Service Hub..."
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-success/50 focus:ring-offset-1 focus:border-success/60"
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

        {isLoading && !streamingContent && <TypingIndicator />}

        <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="bg-background/60 backdrop-blur-md p-4">
        {lastTokenUsage && (
          <div className="mb-2 text-xs text-muted-foreground">
            Tokens: OpenAI {lastTokenUsage.openai.promptTokens} prompt + {lastTokenUsage.openai.completionTokens} completion
            {lastTokenUsage.cohere.inputTokens > 0 && ` • Cohere ~${lastTokenUsage.cohere.inputTokens} (est.)`}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputTextareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your message..."
            disabled={isLoading}
            rows={1}
            className="flex min-h-[44px] max-h-[200px] w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-success/50 focus-visible:ring-offset-1 focus-visible:border-success/60 disabled:cursor-not-allowed disabled:opacity-50 overflow-y-auto"
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
