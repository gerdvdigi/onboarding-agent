"use client";

interface MessageBubbleSkeletonProps {
  /** 'user' = right-aligned, 'assistant' = left-aligned */
  role: "user" | "assistant";
  /** Number of placeholder lines (default 2-4 based on role) */
  lines?: number;
}

/**
 * Skeleton placeholder for a chat message bubble during initial load.
 * Mimics the shape of real messages with subtle pulse animation.
 */
export function MessageBubbleSkeleton({ role, lines = role === "user" ? 2 : 3 }: MessageBubbleSkeletonProps) {
  const lineWidths = ["w-24", "w-32"]


  return (
    <div
      className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}
      aria-hidden
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
          role === "user" ? "bg-primary/20" : "bg-muted"
        }`}
      >
        <div className="space-y-2">
          {Array.from({ length: Math.min(lines, lineWidths.length) }).map((_, i) => (
            <div
              key={i}
              className={`h-3 rounded bg-muted-foreground/20 animate-pulse ${lineWidths[i] ?? "w-full"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
