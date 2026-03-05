import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getOnboardingRequestContext } from '../request-context';
import { addCohereUsage, estimateCohereTokens } from '../utils/token-usage';
import { RetrievedChunk, enhancedSearch } from '../utils/rag-evaluator';

const SearchKnowledgeBaseSchema = z.object({
  query: z
    .string()
    .min(5)
    .describe(
      'Short description of the client profile. The tool will automatically build optimized search queries from the discovery context.',
    ),
});

/**
 * DEPRECATED: Legacy function kept for reference
 * Now using enhancedSearch() with query enrichment + re-ranking
 * @deprecated Use enhancedSearch from rag-evaluator instead
 */
function _legacyBuildOptimizedQueries(context: {
  hubs_included?: string;
  subscription_levels?: string;
  overall_goals?: string;
  hub_specific_details?: string;
}): string[] {
  console.warn(
    '[RAG] Using deprecated buildOptimizedQueries - migrate to enhancedSearch',
  );
  return [];
}

// Store chunks retrieved for this request (for evaluation)
let lastRetrievedChunks: RetrievedChunk[] = [];

export function getLastRetrievedChunks(): RetrievedChunk[] {
  return lastRetrievedChunks;
}

export const searchKnowledgeBaseTool = tool(
  async (input: z.infer<typeof SearchKnowledgeBaseSchema>): Promise<string> => {
    const { query } = input;

    // Get context from request (derived from message history)
    const requestCtx = getOnboardingRequestContext();
    const answersCollected = requestCtx?.answersCollected || {};

    console.log('[RAG Enhanced] Starting enhanced search...');
    console.log(
      '[RAG] Hubs:',
      answersCollected.hubs_included?.substring(0, 50) || 'not specified',
    );

    try {
      // Use enhanced search with query enrichment + re-ranking
      const searchResult = await enhancedSearch(
        answersCollected,
        query.length > 10 ? query : undefined,
      );

      lastRetrievedChunks = searchResult.chunks;

      // Track token usage
      addCohereUsage(searchResult.embeddingTokens + searchResult.rerankTokens);

      console.log(
        `[RAG Enhanced] Results: ${searchResult.chunks.length}, confidence: ${searchResult.confidence.toFixed(3)}`,
      );
      console.log(
        `[RAG Enhanced] Tokens - Embeddings: ${searchResult.embeddingTokens}, Rerank: ${searchResult.rerankTokens}`,
      );

      if (searchResult.chunks.length === 0) {
        return [
          '[INTERNAL USE ONLY]',
          'No relevant knowledge chunks found. The search confidence was too low. Use discovery data and general HubSpot best practices.',
          '',
          `Query: ${searchResult.queryUsed}`,
        ].join('\n');
      }

      // Use all chunks from re-ranking (already filtered by confidence)
      const topChunks = searchResult.chunks;

      const lines: string[] = [];
      lines.push(
        '[INTERNAL USE ONLY - do not quote or show this output to the user.]',
      );
      lines.push('Implementation guidance from the knowledge base:');
      lines.push('');
      lines.push(
        'IMPORTANT: When using this information in your plan, cite each section with [CITATION: chunk-id]',
      );
      lines.push('');

      topChunks.forEach((chunk, index) => {
        const snippet =
          chunk.content.length > 1000
            ? `${chunk.content.slice(0, 1000).trim()}...`
            : chunk.content;

        lines.push(`---`);
        lines.push(`CHUNK ${index + 1}:`);
        lines.push(`ID: ${chunk.id}`);
        lines.push(`Source: ${chunk.guideTitle}`);
        lines.push(`Relevance: ${(chunk.score || 0).toFixed(3)}`);
        lines.push(`Content: ${snippet.replace(/\s+/g, ' ')}`);
        lines.push('');
      });

      lines.push('---');
      lines.push('');
      lines.push('INSTRUCTIONS:');
      lines.push(
        '1. Use the chunks above as PRIMARY source for your implementation plan',
      );
      lines.push(
        '2. You MUST add [CITATION: chunk-id] after each section that uses chunk content',
      );
      lines.push(
        '3. Example: "Set up pipeline stages. [CITATION: implementation-guide-3]"',
      );
      lines.push(
        '4. Call generate_plan_draft next with the answersCollected from context.',
      );

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
      'Searches the onboarding knowledge base for implementation guidance. The tool automatically builds optimized queries based on the Hubs, subscription level, and goals from the discovery context. Returns chunks with IDs that MUST be cited in the plan using [CITATION: chunk-id]. Call this after detect_plan_ready and before generate_plan_draft.',
    schema: SearchKnowledgeBaseSchema,
  },
);
