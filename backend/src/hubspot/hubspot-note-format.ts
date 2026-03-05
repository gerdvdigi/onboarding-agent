/**
 * Helpers to format HubSpot note bodies in HTML.
 * HubSpot accepts HTML in hs_note_body: <br>, <p>, <strong>, <ul>, <li>.
 * All content in English.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Max chars for conversation section (HubSpot note body limit 65536) */
const CONVERSATION_MAX_CHARS = 25000;

function formatConversation(
  messages: Array<{ role: string; content: string }>,
): string {
  if (!messages || messages.length === 0) return '';
  let out = '<p><strong>--- Conversation ---</strong></p>';
  let totalLen = out.length;
  for (const m of messages) {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const content = String(m.content || '').trim();
    if (!content) continue;
    const escaped = escapeHtml(content.slice(0, 2000).replace(/\n/g, '<br>'));
    const block = `<p><strong>${role}:</strong><br>${escaped}</p>`;
    if (totalLen + block.length > CONVERSATION_MAX_CHARS) break;
    out += block;
    totalLen += block.length;
  }
  return out;
}

function formatAnswersCollected(answers: Record<string, string>): string {
  const entries = Object.entries(answers).filter(
    ([, v]) => v && String(v).trim().length > 0,
  );
  if (entries.length === 0) return '';
  const items = entries
    .map(
      ([k, v]) =>
        `<li><strong>${escapeHtml(k.replace(/_/g, ' '))}:</strong> ${escapeHtml(String(v).slice(0, 500).replace(/\n/g, ' '))}</li>`,
    )
    .join('');
  return `<p><strong>Answers Collected</strong></p><ul>${items}</ul>`;
}

/** Common header for all onboarding notes */
function noteHeader(
  conversationTitle: string,
  statusLabel: string,
  website?: string,
): string {
  const websiteLine =
    website && website.trim()
      ? `<br><strong>Website:</strong> ${escapeHtml(website.trim())}`
      : '';
  return `<p><strong>[Onboarding] Conversation:</strong> "${escapeHtml(conversationTitle)}"</p>
<p><strong>${escapeHtml(statusLabel)}</strong></p>
<p><strong>Date:</strong> ${new Date().toISOString().slice(0, 10)}<br>
<strong>Time:</strong> ${new Date().toISOString().slice(11, 19)} UTC${websiteLine}</p>`;
}

/** Note: Conversation Created */
export function formatNoteCreated(
  conversationTitle: string,
  website?: string,
): string {
  return noteHeader(conversationTitle, 'STATUS: Created', website);
}

/** Note: Discovery Started */
export function formatNoteDiscoveryStarted(params: {
  conversationTitle: string;
  website?: string;
  hubs?: string;
  answersCollected?: Record<string, string>;
  discoveryPercentage?: number;
  messages?: Array<{ role: string; content: string }>;
}): string {
  const {
    conversationTitle,
    website,
    hubs,
    answersCollected,
    discoveryPercentage,
    messages,
  } = params;
  const header = noteHeader(
    conversationTitle,
    'STATUS: Discovery Started',
    website,
  );
  const body = `<p>The user has begun the AI-powered discovery chat to define their HubSpot implementation needs.</p>`;
  const extras: string[] = [];
  if (hubs && hubs.trim()) {
    extras.push(
      `<p><strong>Hubs selected:</strong> ${escapeHtml(hubs.trim())}</p>`,
    );
  }
  if (
    discoveryPercentage !== undefined &&
    discoveryPercentage !== null &&
    !Number.isNaN(discoveryPercentage)
  ) {
    extras.push(
      `<p><strong>Discovery progress:</strong> ${discoveryPercentage}%</p>`,
    );
  }
  if (answersCollected && Object.keys(answersCollected).length > 0) {
    extras.push(formatAnswersCollected(answersCollected));
  }
  if (messages && messages.length > 0) {
    extras.push(formatConversation(messages));
  }
  return [header, body, ...extras].filter(Boolean).join('\n');
}

/** Note: Plan Approved */
export function formatNotePlanApproved(params: {
  conversationTitle: string;
  website?: string;
  hubs: string;
  hubTypes?: string;
  timeline?: string;
  modulesCount: number;
  recommendationsCount: number;
  discoverySummary?: string;
  answersCollected?: Record<string, string>;
  discoveryPercentage?: number;
  messages?: Array<{ role: string; content: string }>;
}): string {
  const {
    conversationTitle,
    website,
    hubs,
    hubTypes,
    timeline,
    modulesCount,
    recommendationsCount,
    discoverySummary,
    answersCollected,
    discoveryPercentage,
  } = params;
  const header = noteHeader(
    conversationTitle,
    'STATUS: Plan Approved',
    website,
  );
  const planSection = `<p><strong>Implementation Plan</strong></p>
<ul>
<li><strong>Hubs selected:</strong> ${escapeHtml(hubs || 'None specified')}</li>
${hubTypes ? `<li><strong>Hub types:</strong> ${escapeHtml(hubTypes)}</li>` : ''}
${timeline ? `<li><strong>Timeline:</strong> ${escapeHtml(timeline)}</li>` : ''}
<li><strong>Modules:</strong> ${modulesCount}</li>
<li><strong>Recommendations:</strong> ${recommendationsCount}</li>
${discoveryPercentage !== undefined && !Number.isNaN(discoveryPercentage) ? `<li><strong>Discovery progress:</strong> ${discoveryPercentage}%</li>` : ''}
</ul>`;
  const answersSection =
    answersCollected && Object.keys(answersCollected).length > 0
      ? formatAnswersCollected(answersCollected)
      : '';
  const objectivesSection =
    discoverySummary && discoverySummary.trim()
      ? `<p><strong>Objectives / Discovery Summary</strong></p>
<p>${escapeHtml(discoverySummary.slice(0, 6000).replace(/\n/g, '<br>'))}</p>`
      : '';
  const conversationSection =
    params.messages && params.messages.length > 0
      ? formatConversation(params.messages)
      : '';
  return [
    header,
    planSection,
    answersSection,
    objectivesSection,
    conversationSection,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Note: PDF Downloaded */
export function formatNotePdfDownloaded(params: {
  conversationTitle: string;
  company: string;
  website?: string;
  hubs?: string;
  pdfUrl?: string;
  messages?: Array<{ role: string; content: string }>;
}): string {
  const { conversationTitle, company, website, hubs, pdfUrl, messages } = params;
  const header = noteHeader(
    conversationTitle,
    'STATUS: PDF Downloaded',
    website,
  );
  const body = `<p>The Implementation Plan PDF for <strong>"${escapeHtml(company)}"</strong> has been successfully downloaded.</p>`;
  const hubsLine =
    hubs && hubs.trim()
      ? `<p><strong>Hubs:</strong> ${escapeHtml(hubs.trim())}</p>`
      : '';
  const pdfUrlLine =
    pdfUrl && pdfUrl.trim()
      ? `<p><strong>PDF URL:</strong> <a href="${escapeHtml(pdfUrl.trim())}" target="_blank" rel="noopener noreferrer">View PDF</a></p>`
      : '';
  const conversationSection =
    messages && messages.length > 0 ? formatConversation(messages) : '';
  return [header, body, hubsLine, pdfUrlLine, conversationSection]
    .filter(Boolean)
    .join('\n');
}
