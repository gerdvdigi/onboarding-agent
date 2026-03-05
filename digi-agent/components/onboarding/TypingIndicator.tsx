"use client";

/**
 * Typing indicator shown while waiting for assistant response.
 * Three bouncing dots in a bubble, similar to iMessage/WhatsApp.
 */
export function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Assistant is typing">
      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full bg-muted-foreground/50"
            style={{
              animation: "typing-bounce 1.4s ease-in-out infinite",
              animationDelay: "0ms",
            }}
          />
          <span
            className="h-2 w-2 rounded-full bg-muted-foreground/50"
            style={{
              animation: "typing-bounce 1.4s ease-in-out infinite",
              animationDelay: "200ms",
            }}
          />
          <span
            className="h-2 w-2 rounded-full bg-muted-foreground/50"
            style={{
              animation: "typing-bounce 1.4s ease-in-out infinite",
              animationDelay: "400ms",
            }}
          />
        </div>
      </div>
    </div>
  );
}
