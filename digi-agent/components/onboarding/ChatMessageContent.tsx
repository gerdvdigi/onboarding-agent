"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * Normalizes Markdown content to ensure proper rendering:
 * - Removes empty bullets and headers
 * - Fixes text glued to headers (e.g., "HUBHere" -> "HUB\n\nHere")
 * - Joins bullets with content that landed on a separate line
 * - Fixes numbers glued to text
 */
function normalizeMarkdown(content: string): string {
  let normalized = content;

  // ═══════════════════════════════════════════════════════════════
  // 0. FIX BROKEN BRAND NAMES (HubSpot split across lines/spaces)
  // ═══════════════════════════════════════════════════════════════
  
  // Fix "Hub\nSpot" or "Hub\n\nSpot" or "Hub \n Spot" -> "HubSpot"
  normalized = normalized.replace(/Hub\s*\n+\s*Spot/gi, "HubSpot");
  
  // Fix "Hub Spot" in any context -> "HubSpot"
  normalized = normalized.replace(/Hub\s+Spot(?=\s|[.,!?:;]|$)/gi, "HubSpot");
  
  // Fix remaining "Hub Spot" patterns
  normalized = normalized.replace(/\bHub\s+Spot\b/gi, "HubSpot");
  
  // Fix "Hub\nSpot" that might have been created by streaming
  normalized = normalized.replace(/Hub[\s\n]+Spot/gi, "HubSpot");

  // ═══════════════════════════════════════════════════════════════
  // 1. REMOVE EMPTY ELEMENTS
  // ═══════════════════════════════════════════════════════════════

  // Remove empty headers (lines that are just # or ## or ### with nothing after)
  normalized = normalized.replace(/^#{1,6}\s*$/gm, "");

  // Remove empty bullets: lines that are just "- " or "* " with nothing useful
  // Pattern: line that is only "-" or "- " optionally followed by whitespace/newline
  normalized = normalized.replace(/^[-*]\s*$/gm, "");

  // Remove bullets that only have whitespace after them (empty list items)
  normalized = normalized.replace(/^([-*])\s+\n/gm, "\n");

  // ═══════════════════════════════════════════════════════════════
  // 2. JOIN BULLETS WITH CONTENT ON NEXT LINE
  // ═══════════════════════════════════════════════════════════════

  // Fix: "- \n  Content" -> "- Content"
  // The bullet is on one line, the content on the next
  normalized = normalized.replace(/^([-*])\s*\n+\s*([A-Za-z\*\[])/gm, "$1 $2");

  // Fix: "1. \n  Content" -> "1. Content" (numbered lists)
  normalized = normalized.replace(/^(\d+\.)\s*\n+\s*([A-Za-z\*\[])/gm, "$1 $2");

  // ═══════════════════════════════════════════════════════════════
  // 3. FIX GLUED TEXT (words stuck together without space)
  // ═══════════════════════════════════════════════════════════════

  // Fix headers glued to following text: "## SALES HUBHere are" -> "## SALES HUB\n\nHere are"
  // Pattern: word ending in lowercase/uppercase followed immediately by uppercase+lowercase (new sentence)
  normalized = normalized.replace(
    /^(#{1,6}\s+.+?)([a-zA-Z])([A-Z][a-z])/gm,
    (match, header, lastChar, newWord) => {
      // If there's no space before the new word, add line break
      return `${header}${lastChar}\n\n${newWord}`;
    }
  );

  // Fix text glued after certain keywords: "HUBHere" "StageThe" etc.
  // IMPORTANT: Use negative lookahead to exclude "HubSpot" - case insensitive!
  normalized = normalized.replace(/Hub(?!Spot)([A-Z][a-z])/gi, "Hub\n\n$1");
  normalized = normalized.replace(/(Stage|Step|Process|Setup|Automation)([A-Z][a-z])/g, "$1\n\n$2");

  // Fix lowercase word directly followed by capitalized section/stage name
  // e.g., "dealProposal Sent Stage" -> "deal\n\nProposal Sent Stage"
  normalized = normalized.replace(/([a-z])((?:Proposal|Discovery|Follow|Deal|Closed|Marketing|Sales|Service|Technical|Buyer|Lead|Account)\s+[A-Z])/g, "$1\n\n$2");

  // Fix text directly followed by bold stage/section headers
  // e.g., "sent**Follow-up/Negotiation Stage**" -> "sent\n\n**Follow-up/Negotiation Stage**"
  normalized = normalized.replace(/([a-z])\*\*([A-Z][a-z])/g, "$1\n\n**$2");

  // Fix word ending directly followed by capitalized word (new sentence/section)
  // e.g., "CreationDeal automations" -> "Creation\n\nDeal automations"
  // e.g., "lossStep: Deal" -> "loss\n\nStep: Deal"  
  normalized = normalized.replace(/([a-z])(Deal|Step|Stage|Section|Properties|Automations|Where|Helpful|Campaign|Persona|Technical|Tracking|Privacy|Buyer|Lead|Forms|Chatbots)(?=[:\s])/g, "$1\n\n$2");

  // Fix inline glued text: "callProposal" "daysWhere" etc.
  normalized = normalized.replace(/([a-z])((?:Proposal|Where|Helpful|Properties|Automations|The trigger|A deal|Here are|Some of|Our initial)[^a-z])/g, "$1\n\n$2");

  // ═══════════════════════════════════════════════════════════════
  // 4. FIX BOLD LABELS SEPARATED FROM CONTENT
  // ═══════════════════════════════════════════════════════════════

  // Fix: "**Company Size**\n: Text" -> "**Company Size**: Text"
  normalized = normalized.replace(/(\*\*[^*]+\*\*)\s*\n+\s*(:?\s*)/g, "$1$2");

  // Fix: "**Label:**\nValue" -> "**Label:** Value"
  normalized = normalized.replace(/(\*\*[^*]+:\*\*)\s*\n+\s*([A-Za-z0-9])/g, "$1 $2");

  // Ensure space after bold labels: "**Where:**Settings" -> "**Where:** Settings"
  normalized = normalized.replace(/(\*\*[^*]+:\*\*)([A-Za-z])/g, "$1 $2");

  // ═══════════════════════════════════════════════════════════════
  // 5. FIX NUMBERS GLUED TO TEXT
  // ═══════════════════════════════════════════════════════════════

  // Fix: "follow-up3 days" -> "follow-up 3 days"
  normalized = normalized.replace(/([a-zA-Z])(\d+\s+(?:days?|weeks?|hours?|minutes?|emails?))/gi, "$1 $2");

  // Fix: "over2 weeks" -> "over 2 weeks"
  normalized = normalized.replace(/(over|after|in|for)(\d)/gi, "$1 $2");

  // Fix: "Persona1" -> "Persona 1"
  normalized = normalized.replace(/(Persona|Campaign|Step|Stage|Process|Pipeline)(\d)/gi, "$1 $2");

  // Fix: "converted.5-email" -> "converted. 5-email"
  normalized = normalized.replace(/(\.)(\d+-)/g, "$1 $2");

  // ═══════════════════════════════════════════════════════════════
  // 6. ENSURE PROPER LINE BREAKS
  // ═══════════════════════════════════════════════════════════════

  // Fix headers completely glued to previous text (no newline at all)
  // e.g., "deals## ACCOUNT" -> "deals\n\n## ACCOUNT"
  normalized = normalized.replace(/([a-zA-Z0-9.,!?:;\-\)])(#{1,6}\s)/g, "$1\n\n$2");

  // Ensure blank line before headers (but not at start) - single newline case
  normalized = normalized.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");

  // Fix bold text or labels glued to previous content without newline
  // e.g., "Plan**Objectives:**" -> "Plan\n\n**Objectives:**"
  normalized = normalized.replace(/([a-zA-Z0-9])\*\*([A-Z][a-z]+.*?:)\*\*/g, "$1\n\n**$2**");

  // Fix text ending in word directly followed by bold section header
  // e.g., "deals**Where to do this" -> "deals\n\n**Where to do this"
  normalized = normalized.replace(/([a-z])\*\*(?=Where|Helpful|Properties|Automations|Campaign|Persona|Technical)/g, "$1\n\n**");

  // Fix bullets stuck to previous text: "textContent- Next" -> "textContent\n\n- Next"
  normalized = normalized.replace(/([a-zA-Z:.])([-*]\s+[A-Z\*\[])/g, "$1\n$2");

  // Ensure "-" has space after it: "-Item" -> "- Item"
  normalized = normalized.replace(/^-([A-Za-z\*])/gm, "- $1");

  // ═══════════════════════════════════════════════════════════════
  // 7. FINAL CLEANUP
  // ═══════════════════════════════════════════════════════════════

  // Clean up excessive newlines (more than 2 consecutive)
  normalized = normalized.replace(/\n{3,}/g, "\n\n");

  // Remove lines that are only whitespace
  normalized = normalized.replace(/^\s+$/gm, "");

  // ═══════════════════════════════════════════════════════════════
  // 8. FINAL FIX FOR HUBSPOT (run LAST to catch any broken instances)
  // ═══════════════════════════════════════════════════════════════
  // This must run after all other transformations since some patterns might break HubSpot
  normalized = normalized.replace(/Hub[\s\n]+Spot/gi, "HubSpot");

  return normalized;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-4 text-xl font-bold leading-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-lg font-bold leading-tight first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-base font-semibold leading-tight first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline hover:opacity-80"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-disc list-inside space-y-1 pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal list-inside space-y-1 pl-1">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-muted-foreground/50 pl-3 italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-medium">
          {children}
        </code>
      );
    }
    return (
      <code className="block overflow-x-auto rounded bg-muted p-3 text-sm">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded bg-muted p-3 text-sm">
      {children}
    </pre>
  ),
};

interface ChatMessageContentProps {
  content: string;
  className?: string;
}

/**
 * Renders chat message content as rich Markdown (titles, bold, links, lists)
 * so it looks like a document instead of plain text.
 */
export function ChatMessageContent({ content, className = "" }: ChatMessageContentProps) {
  // Normalize the markdown to fix common LLM formatting issues
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);

  return (
    <div className={`chat-message-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
