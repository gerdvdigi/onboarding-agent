/**
 * Normalizes Markdown content to ensure proper rendering.
 * MUST mirror the frontend's normalizeMarkdown (ChatMessageContent.tsx)
 * so PDF output matches the chat display exactly.
 */
export function normalizeMarkdown(content: string): string {
  let normalized = content;

  // 0. FIX BROKEN BRAND NAMES (HubSpot split across lines/spaces)
  normalized = normalized.replace(/Hub\s*\n+\s*Spot/gi, 'HubSpot');
  normalized = normalized.replace(/Hub\s+Spot(?=\s|[.,!?:;]|$)/gi, 'HubSpot');
  normalized = normalized.replace(/\bHub\s+Spot\b/gi, 'HubSpot');
  normalized = normalized.replace(/Hub[\s\n]+Spot/gi, 'HubSpot');

  // 1. REMOVE EMPTY ELEMENTS
  normalized = normalized.replace(/^#{1,6}\s*$/gm, '');
  normalized = normalized.replace(/^[-*]\s*$/gm, '');
  normalized = normalized.replace(/^([-*])\s+\n/gm, '\n');

  // 2. JOIN BULLETS WITH CONTENT ON NEXT LINE
  normalized = normalized.replace(/^([-*])\s*\n+\s*([A-Za-z\*\[])/gm, '$1 $2');
  normalized = normalized.replace(/^(\d+\.)\s*\n+\s*([A-Za-z\*\[])/gm, '$1 $2');

  // 3. FIX GLUED TEXT
  normalized = normalized.replace(
    /^(#{1,6}\s+.+?)([a-zA-Z])([A-Z][a-z])/gm,
    (_m, header, lastChar, newWord) => `${header}${lastChar}\n\n${newWord}`,
  );
  normalized = normalized.replace(/Hub(?!Spot)([A-Z][a-z])/gi, 'Hub\n\n$1');
  normalized = normalized.replace(/(Stage|Step|Process|Setup|Automation)([A-Z][a-z])/g, '$1\n\n$2');
  normalized = normalized.replace(
    /([a-z])((?:Proposal|Discovery|Follow|Deal|Closed|Marketing|Sales|Service|Technical|Buyer|Lead|Account)\s+[A-Z])/g,
    '$1\n\n$2',
  );
  normalized = normalized.replace(/([a-z])\*\*([A-Z][a-z])/g, '$1\n\n**$2');
  normalized = normalized.replace(
    /([a-z])(Deal|Step|Stage|Section|Properties|Automations|Where|Helpful|Campaign|Persona|Technical|Tracking|Privacy|Buyer|Lead|Forms|Chatbots)(?=[:\s])/g,
    '$1\n\n$2',
  );
  normalized = normalized.replace(
    /([a-z])((?:Proposal|Where|Helpful|Properties|Automations|The trigger|A deal|Here are|Some of|Our initial)[^a-z])/g,
    '$1\n\n$2',
  );

  // 4. FIX BOLD LABELS SEPARATED FROM CONTENT
  normalized = normalized.replace(/(\*\*[^*]+\*\*)\s*\n+\s*(:?\s*)/g, '$1$2');
  normalized = normalized.replace(/(\*\*[^*]+:\*\*)\s*\n+\s*([A-Za-z0-9])/g, '$1 $2');
  normalized = normalized.replace(/(\*\*[^*]+:\*\*)([A-Za-z])/g, '$1 $2');
  normalized = normalized.replace(/(\*\*[^*]+:\*\*)- ([A-Za-z])/g, '$1\n\n- $2');
  normalized = normalized.replace(
    /(Makers|Automation|Sequence|Segmentation)\*{0,2}(-\s+)(Qualifier|Triggered|For|Score|Create)/g,
    '$1\n\n$2$3',
  );
  normalized = normalized.replace(/(Helpful Articles)(:\s*-\s*)([A-Za-z])/g, '$1:\n\n- $3');
  normalized = normalized.replace(/(Helpful Article[s]?):([A-Za-z\[\-])/g, '$1: $2');
  normalized = normalized.replace(/(Helpful Article[s]?):-(?=\S)/g, '$1:\n\n- ');
  normalized = normalized.replace(/(Helpful Articles?):-/g, '$1:\n\n- ');

  // 5. FIX NUMBERS GLUED TO TEXT
  normalized = normalized.replace(/([a-zA-Z])(\d+\s+(?:days?|weeks?|hours?|minutes?|emails?))/gi, '$1 $2');
  normalized = normalized.replace(/(over|after|in|for)(\d)/gi, '$1 $2');
  normalized = normalized.replace(/(Persona|Campaign|Step|Stage|Process|Pipeline)(\d)/gi, '$1 $2');
  normalized = normalized.replace(/(\.)(\d+-)/g, '$1 $2');

  // 6. ENSURE PROPER LINE BREAKS
  normalized = normalized.replace(/([a-zA-Z0-9.,!?:;\-\)])(#{1,6}\s)/g, '$1\n\n$2');
  normalized = normalized.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
  normalized = normalized.replace(/([a-zA-Z0-9])\*\*([A-Z][a-z]+.*?:)\*\*/g, '$1\n\n**$2**');
  normalized = normalized.replace(/([a-z])\*\*(?=Where|Helpful|Properties|Automations|Campaign|Persona|Technical)/g, '$1\n\n**');
  normalized = normalized.replace(/([a-zA-Z:.])([-*]\s+[A-Z\*\[])/g, '$1\n$2');
  normalized = normalized.replace(/^-([A-Za-z\*])/gm, '- $1');

  // 7. FINAL CLEANUP
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  normalized = normalized.replace(/^\s+$/gm, '');

  // 8. FINAL FIX FOR HUBSPOT
  normalized = normalized.replace(/Hub[\s\n]+Spot/gi, 'HubSpot');

  return normalized;
}
