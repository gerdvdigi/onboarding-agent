import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getPineconeStore } from '../vector-store/pinecone-store';
import { getOnboardingRequestContext } from '../request-context';

const SearchKnowledgeBaseSchema = z.object({
  query: z
    .string()
    .min(5)
    .describe(
      'Short description of the client profile. The tool will automatically build optimized search queries from the discovery context.',
    ),
});

/**
 * Extracts keywords from goals/details text for better RAG queries.
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lower = text.toLowerCase();

  // Common HubSpot feature keywords
  const featurePatterns = [
    'pipeline', 'deal', 'automation', 'workflow', 'lead scoring', 'lead assignment',
    'forms', 'landing page', 'email', 'nurturing', 'sequences', 'templates',
    'snippets', 'documents', 'quotes', 'forecast', 'reporting', 'dashboard',
    'ticket', 'knowledge base', 'chatbot', 'live chat', 'inbox', 'survey',
    'csat', 'nps', 'contact', 'company', 'properties', 'lifecycle',
    'tracking code', 'ads', 'social media', 'blog', 'seo',
  ];

  for (const pattern of featurePatterns) {
    if (lower.includes(pattern)) {
      keywords.push(pattern);
    }
  }

  // Common goal keywords
  const goalPatterns = [
    'organize', 'automate', 'reduce manual', 'qualification', 'follow-up',
    'visibility', 'reporting', 'roi', 'conversion', 'onboarding',
  ];

  for (const pattern of goalPatterns) {
    if (lower.includes(pattern)) {
      keywords.push(pattern);
    }
  }

  return [...new Set(keywords)]; // dedupe
}

/**
 * Detects which Hubs are included from the hubs_included text.
 */
function detectHubs(hubsText: string): { sales: boolean; marketing: boolean; service: boolean } {
  const lower = hubsText.toLowerCase();
  return {
    sales: lower.includes('sales'),
    marketing: lower.includes('marketing'),
    service: lower.includes('service'),
  };
}

/**
 * Extracts subscription level from text.
 */
function extractLevel(levelText: string): string {
  const lower = levelText.toLowerCase();
  if (lower.includes('enterprise')) return 'Enterprise';
  if (lower.includes('professional')) return 'Professional';
  if (lower.includes('starter')) return 'Starter';
  if (lower.includes('free')) return 'Free';
  return 'Professional'; // default
}

/**
 * Builds optimized search queries for each Hub.
 */
function buildOptimizedQueries(context: {
  hubs_included?: string;
  subscription_levels?: string;
  overall_goals?: string;
  hub_specific_details?: string;
}): string[] {
  const queries: string[] = [];
  const hubs = detectHubs(context.hubs_included || '');
  const level = extractLevel(context.subscription_levels || '');

  // Extract keywords from goals and details
  const goalKeywords = extractKeywords(context.overall_goals || '');
  const detailKeywords = extractKeywords(context.hub_specific_details || '');
  const allKeywords = [...new Set([...goalKeywords, ...detailKeywords])];

  // Build Hub-specific queries
  if (hubs.sales) {
    const salesKeywords = allKeywords.filter(k =>
      ['pipeline', 'deal', 'automation', 'workflow', 'lead assignment', 'sequences',
       'templates', 'snippets', 'documents', 'quotes', 'forecast', 'reporting',
       'follow-up', 'qualification'].some(sk => k.includes(sk))
    );
    const baseKeywords = ['pipeline', 'deal stages', 'automation'];
    const combined = [...new Set([...baseKeywords, ...salesKeywords])].slice(0, 6);
    queries.push(`Sales Hub ${level} ${combined.join(' ')}`);
  }

  if (hubs.marketing) {
    const marketingKeywords = allKeywords.filter(k =>
      ['lead scoring', 'forms', 'landing page', 'email', 'nurturing', 'workflow',
       'automation', 'tracking code', 'ads', 'social media', 'blog', 'lifecycle',
       'conversion', 'roi'].some(mk => k.includes(mk))
    );
    const baseKeywords = ['lead scoring', 'forms', 'email workflows'];
    const combined = [...new Set([...baseKeywords, ...marketingKeywords])].slice(0, 6);
    queries.push(`Marketing Hub ${level} ${combined.join(' ')}`);
  }

  if (hubs.service) {
    const serviceKeywords = allKeywords.filter(k =>
      ['ticket', 'knowledge base', 'chatbot', 'live chat', 'inbox', 'survey',
       'csat', 'nps', 'onboarding'].some(sk => k.includes(sk))
    );
    const baseKeywords = ['ticket pipeline', 'knowledge base', 'surveys'];
    const combined = [...new Set([...baseKeywords, ...serviceKeywords])].slice(0, 6);
    queries.push(`Service Hub ${level} ${combined.join(' ')}`);
  }

  // Always add a general implementation query
  queries.push(`HubSpot implementation plan ${level} setup configuration`);

  return queries;
}

export const searchKnowledgeBaseTool = tool(
  async (input: z.infer<typeof SearchKnowledgeBaseSchema>): Promise<string> => {
    const { query } = input;
    const store = await getPineconeStore();

    // Get context from request (derived from message history)
    const requestCtx = getOnboardingRequestContext();
    const answersCollected = requestCtx?.answersCollected || {};

    // Log what we're working with
    console.log('[RAG] Building optimized queries from context...');
    console.log('[RAG] Hubs:', answersCollected.hubs_included?.substring(0, 50) || 'not specified');
    console.log('[RAG] Level:', answersCollected.subscription_levels?.substring(0, 50) || 'not specified');

    if (!store) {
      return [
        '[INTERNAL USE ONLY]',
        'Knowledge base is currently unavailable. Use discovery data and standard HubSpot best practices.',
        '',
        `LLM provided query: ${query.substring(0, 200)}`,
      ].join('\n');
    }

    try {
      // Build optimized queries based on context
      const optimizedQueries = buildOptimizedQueries(answersCollected);
      console.log('[RAG] Optimized queries:', optimizedQueries);

      // Run multiple searches and combine results (dedupe by content)
      const allDocs: Array<{ pageContent: string; metadata: Record<string, any> }> = [];
      const seenContent = new Set<string>();

      for (const q of optimizedQueries) {
        const docs = await store.similaritySearch(q, 3, { type: 'knowledge' });
        for (const doc of docs) {
          const contentKey = doc.pageContent.substring(0, 100);
          if (!seenContent.has(contentKey)) {
            seenContent.add(contentKey);
            allDocs.push(doc);
          }
        }
      }

      // Also search with the LLM's query as fallback (lower priority)
      if (query.length > 20) {
        const fallbackDocs = await store.similaritySearch(query, 2, { type: 'knowledge' });
        for (const doc of fallbackDocs) {
          const contentKey = doc.pageContent.substring(0, 100);
          if (!seenContent.has(contentKey)) {
            seenContent.add(contentKey);
            allDocs.push(doc);
          }
        }
      }

      console.log(`[RAG] Total unique docs retrieved: ${allDocs.length}`);

      if (allDocs.length === 0) {
        return [
          '[INTERNAL USE ONLY]',
          'No specific knowledge chunks were found. Use discovery data and general HubSpot best practices.',
          '',
          `Queries attempted: ${optimizedQueries.join(' | ')}`,
        ].join('\n');
      }

      // Limit to top 8 docs
      const topDocs = allDocs.slice(0, 8);

      const lines: string[] = [];
      lines.push('[INTERNAL USE ONLY - do not quote or show this output to the user.]');
      lines.push('Implementation guidance from the knowledge base:');
      lines.push('');

      topDocs.forEach((doc, index) => {
        const meta = (doc.metadata || {}) as Record<string, any>;
        const guideTitle = meta.guideTitle || meta.sectionType || 'Guide';
        const raw = String(doc.pageContent || '').trim();
        const snippet = raw.length > 350 ? `${raw.slice(0, 350).trim()}...` : raw;
        lines.push(`(${index + 1}) [${guideTitle}]: ${snippet.replace(/\s+/g, ' ')}`);
      });

      lines.push('');
      lines.push('Use this guidance to refine the implementation plan. Do not quote or show this to the user.');
      lines.push('Call generate_plan_draft next with the answersCollected from context.');

      return lines.join('\n');
    } catch (error) {
      console.error('[RAG] Error in search_company_knowledge:', error);
      return [
        '[INTERNAL USE ONLY]',
        'Knowledge search failed. Fall back to standard implementation templates and discovery data.',
        '',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ].join('\n');
    }
  },
  {
    name: 'search_company_knowledge',
    description:
      'Searches the onboarding knowledge base for implementation guidance. The tool automatically builds optimized queries based on the Hubs, subscription level, and goals from the discovery context. Call this after detect_plan_ready and before generate_plan_draft.',
    schema: SearchKnowledgeBaseSchema,
  },
);

