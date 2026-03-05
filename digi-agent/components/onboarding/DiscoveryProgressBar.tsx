"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { getDiscoveryProgress } from "@/lib/utils/discovery-progress";

const INFO_TOOLTIP =
  "As you answer questions, this bar fills up. When it's complete, we'll generate your personalized HubSpot implementation plan based on your answers.";

interface DiscoveryProgressBarProps {
  messages: Array<{ role: string; content: string }>;
  /** Hide when plan is generated (discovery is done) */
  hideWhenComplete?: boolean;
  /** Force hide (e.g. when plan draft is shown) */
  hidden?: boolean;
}

export function DiscoveryProgressBar({
  messages,
  hideWhenComplete = true,
  hidden = false,
}: DiscoveryProgressBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  const updatePosition = useCallback(() => {
    const el = iconRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltipPosition({
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }, []);

  const handleMouseEnter = () => {
    updatePosition();
    setShowTooltip(true);
  };

  const handleMouseLeave = () => setShowTooltip(false);

  useEffect(() => {
    if (!showTooltip || typeof document === "undefined") return;
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [showTooltip, updatePosition]);

  const progress = getDiscoveryProgress(messages);

  const shouldHide =
    hidden || (hideWhenComplete && (progress.isComplete || progress.percentage >= 100));

  const tooltipPortal =
    typeof document !== "undefined" &&
    showTooltip &&
    createPortal(
      <div
        className="fixed z-[9999] w-64 -translate-x-1/2 -translate-y-full -mt-1.5 rounded bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-lg border border-border"
        style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        role="tooltip"
      >
        {INFO_TOOLTIP}
      </div>,
      document.body
    );

  return (
    <>
      {tooltipPortal}
      <div
        className="space-y-1.5 shrink-0 bg-background/60 backdrop-blur-md px-4 py-2"
        hidden={shouldHide}
        aria-hidden={shouldHide}
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Discovery progress</span>
          <span
            ref={iconRef}
            className="inline-flex cursor-help"
            title={INFO_TOOLTIP}
            aria-label={INFO_TOOLTIP}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Info className="h-3.5 w-3.5 text-muted-foreground/70" />
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>
    </>
  );
}
