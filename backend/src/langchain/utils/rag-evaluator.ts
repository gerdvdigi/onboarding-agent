import { CohereEmbeddings } from '@langchain/cohere';
import { CohereRerank } from '@langchain/cohere';
import { Document } from '@langchain/core/documents';
import { getPineconeStore } from '../vector-store/pinecone-store';

let embeddingsInstance: CohereEmbeddings | null = null;

function getEmbeddings(): CohereEmbeddings {
  if (embeddingsInstance) return embeddingsInstance;

  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error('COHERE_API_KEY is required');

  embeddingsInstance = new CohereEmbeddings({
    apiKey,
    model: process.env.COHERE_MODEL || 'embed-english-v3.0',
  });
  return embeddingsInstance;
}

/**
 * Representa un chunk recuperado del RAG con su metadata completa
 */
export interface RetrievedChunk {
  id: string;
  content: string;
  source: string;
  guideTitle: string;
  sectionType: string;
  chunkIndex: number;
  score?: number; // Similaridad al query
}

/**
 * Resultado de una búsqueda RAG
 */
export interface RAGSearchResult {
  chunks: RetrievedChunk[];
  query: string;
  totalChunks: number;
  embeddingTokens: number;
}

/**
 * Cita de un chunk usado en el plan generado
 */
export interface ChunkCitation {
  chunkId: string;
  section: string; // Ej: "Sales Hub - Pipeline Setup"
  relevance: 'high' | 'medium' | 'low';
  quotedText: string;
}

/**
 * Métricas de uso del RAG en un plan generado
 */
export interface RAGUsageMetrics {
  // Cobertura: % de chunks recuperados que fueron citados
  citationCoverage: number;

  // Densidad: cuántas citas por sección del plan
  citationsPerSection: Record<string, number>;

  // Originalidad: qué tan diferente es el plan de usar solo el system prompt
  originalityScore: number;

  // Hallucination score: contenido en el plan que no está en los chunks
  hallucinationScore: number;

  // Total de citas
  totalCitations: number;

  // Detalle por chunk
  chunkUsage: Record<string, { cited: boolean; sections: string[] }>;

  // Timestamp
  evaluatedAt: string;
}

/**
 * Busca chunks en el knowledge base con scores de similaridad
 */
export async function searchChunksWithScores(
  query: string,
  k: number = 8,
): Promise<RAGSearchResult> {
  const store = await getPineconeStore();
  if (!store) {
    throw new Error('Pinecone store not available');
  }

  // Generar embedding para el query
  const embeddings = getEmbeddings();
  const queryEmbedding = await embeddings.embedQuery(query);

  // Calcular tokens usados (aproximado: 1 token ≈ 4 caracteres)
  const embeddingTokens = Math.ceil(query.length / 4);

  // Buscar con similaridad
  const results = await store.similaritySearchVectorWithScore(
    queryEmbedding,
    k,
    {
      type: 'knowledge',
    },
  );

  const chunks: RetrievedChunk[] = results.map(([doc, score], index) => ({
    id: `${doc.metadata?.guideId || 'unknown'}-${doc.metadata?.chunkIndex || index}`,
    content: doc.pageContent,
    source: doc.metadata?.source || 'unknown',
    guideTitle: doc.metadata?.guideTitle || 'Guide',
    sectionType: doc.metadata?.sectionType || 'guide',
    chunkIndex: doc.metadata?.chunkIndex || index,
    score,
  }));

  return {
    chunks,
    query,
    totalChunks: chunks.length,
    embeddingTokens,
  };
}

/**
 * Extrae citas del plan generado
 * Busca patrones como: [CITATION: chunk-id] o referencias a guías
 */
export function extractCitations(planContent: string): ChunkCitation[] {
  const citations: ChunkCitation[] = [];

  // Patrón 1: [CITATION: guide-id-X]
  const citationPattern = /\[CITATION:\s*([^\]]+)\]/g;
  let match;
  while ((match = citationPattern.exec(planContent)) !== null) {
    const chunkId = match[1].trim();
    // Buscar contexto (sección)
    const sectionMatch = planContent
      .substring(0, match.index)
      .match(/#{1,3}\s+([^\n]+)/g);
    const section = sectionMatch
      ? sectionMatch[sectionMatch.length - 1].replace(/^#+\s*/, '')
      : 'Unknown';

    citations.push({
      chunkId,
      section,
      relevance: 'high',
      quotedText: '',
    });
  }

  // Patrón 2: Referencias a "Guide" o "Article" seguidas de contenido similar
  const guidePattern = /\[([^\]]+Guide[^\]]*)\]\([^)]+\)/g;
  while ((match = guidePattern.exec(planContent)) !== null) {
    const guideName = match[1];
    const sectionMatch = planContent
      .substring(0, match.index)
      .match(/#{1,3}\s+([^\n]+)/g);
    const section = sectionMatch
      ? sectionMatch[sectionMatch.length - 1].replace(/^#+\s*/, '')
      : 'Unknown';

    citations.push({
      chunkId: guideName.toLowerCase().replace(/\s+/g, '-'),
      section,
      relevance: 'medium',
      quotedText: '',
    });
  }

  return citations;
}

/**
 * Calcula métricas de uso del RAG
 */
export function calculateRAGMetrics(
  retrievedChunks: RetrievedChunk[],
  planContent: string,
  citations: ChunkCitation[],
): RAGUsageMetrics {
  const chunkUsage: Record<string, { cited: boolean; sections: string[] }> = {};
  const citationsPerSection: Record<string, number> = {};

  // Inicializar tracking de chunks
  retrievedChunks.forEach((chunk) => {
    chunkUsage[chunk.id] = { cited: false, sections: [] };
  });

  // Contar citas por chunk y por sección
  citations.forEach((citation) => {
    if (chunkUsage[citation.chunkId]) {
      chunkUsage[citation.chunkId].cited = true;
      chunkUsage[citation.chunkId].sections.push(citation.section);
    }

    citationsPerSection[citation.section] =
      (citationsPerSection[citation.section] || 0) + 1;
  });

  // Calcular cobertura (% de chunks citados)
  const citedCount = Object.values(chunkUsage).filter((u) => u.cited).length;
  const citationCoverage =
    retrievedChunks.length > 0
      ? (citedCount / retrievedChunks.length) * 100
      : 0;

  // Estimar hallucination: buscar "hallmarks" de contenido específico de HubSpot
  // que no esté en los chunks
  const hallucinationIndicators = [
    /according to my knowledge/i,
    /i believe that/i,
    /in my experience/i,
    /typically/i,
    /usually/i,
  ];

  let hallucinationCount = 0;
  hallucinationIndicators.forEach((pattern) => {
    const matches = planContent.match(pattern);
    if (matches) hallucinationCount += matches.length;
  });

  const hallucinationScore = Math.min(100, hallucinationCount * 10);

  // Score de originalidad: basado en citas y especificidad
  // Un plan que cita chunks específicos es más "original" (basado en RAG)
  const specificityScore =
    citations.filter((c) => c.relevance === 'high').length * 10;
  const originalityScore = Math.min(
    100,
    citationCoverage * 0.5 + specificityScore,
  );

  return {
    citationCoverage,
    citationsPerSection,
    originalityScore,
    hallucinationScore,
    totalCitations: citations.length,
    chunkUsage,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Compara el plan generado contra los chunks para detectar contenido no sustentado
 */
export async function validatePlanAgainstChunks(
  planContent: string,
  chunks: RetrievedChunk[],
): Promise<{
  unsupportedSections: Array<{ section: string; reason: string }>;
  coverage: number;
}> {
  const embeddings = getEmbeddings();
  const unsupportedSections: Array<{ section: string; reason: string }> = [];

  // Dividir el plan en secciones (por pipelines/hubs)
  const sections = planContent.split(/(?=##\s+)/).filter((s) => s.trim());

  let supportedSections = 0;

  for (const section of sections) {
    const sectionTitle = section.match(/^##\s+(.+)$/m)?.[1] || 'Unknown';

    // Generar embedding de la sección
    const sectionEmbedding = await embeddings.embedQuery(
      section.substring(0, 1000),
    );

    // Calcular similaridad con cada chunk
    let maxSimilarity = 0;
    for (const chunk of chunks) {
      const chunkEmbedding = await embeddings.embedQuery(
        chunk.content.substring(0, 1000),
      );
      const similarity = cosineSimilarity(sectionEmbedding, chunkEmbedding);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    // Si la similaridad máxima es baja, la sección puede ser "hallucination"
    if (maxSimilarity < 0.6) {
      unsupportedSections.push({
        section: sectionTitle,
        reason: `Low semantic similarity (${maxSimilarity.toFixed(2)}) with retrieved chunks`,
      });
    } else {
      supportedSections++;
    }
  }

  const coverage =
    sections.length > 0 ? (supportedSections / sections.length) * 100 : 0;

  return { unsupportedSections, coverage };
}

/**
 * Calcula similaridad coseno entre dos vectores
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vectors must have same length');

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Formatea métricas para logging
 */
export function formatRAGMetrics(metrics: RAGUsageMetrics): string {
  return `
╔══════════════════════════════════════════════════════════════╗
║                  RAG USAGE METRICS                           ║
╠══════════════════════════════════════════════════════════════╣
║ Citation Coverage:      ${metrics.citationCoverage.toFixed(1)}%${' '.repeat(31 - metrics.citationCoverage.toFixed(1).length)}║
║ Originality Score:      ${metrics.originalityScore.toFixed(1)}%${' '.repeat(31 - metrics.originalityScore.toFixed(1).length)}║
║ Hallucination Score:    ${metrics.hallucinationScore.toFixed(1)}%${' '.repeat(31 - metrics.hallucinationScore.toFixed(1).length)}║
║ Total Citations:        ${metrics.totalCitations}${' '.repeat(31 - String(metrics.totalCitations).length)}║
╠══════════════════════════════════════════════════════════════╣
║ Citations per Section:                                       ║
${
  Object.entries(metrics.citationsPerSection)
    .map(
      ([section, count]) =>
        `║  • ${section.substring(0, 50)}${': '.padEnd(52 - Math.min(section.length, 50))}${count}${' '.repeat(6 - String(count).length)}║`,
    )
    .join('\n') ||
  '║  (No citations found)                                       ║'
}
╠══════════════════════════════════════════════════════════════╣
║ Chunk Usage:                                                 ║
║  Chunks cited: ${Object.values(metrics.chunkUsage).filter((u) => u.cited).length}/${Object.keys(metrics.chunkUsage).length}${' '.repeat(43)}║
╚══════════════════════════════════════════════════════════════╝
  `;
}

// ═══════════════════════════════════════════════════════════════════
// IMPROVED RAG SEARCH (Item 2)
// ═══════════════════════════════════════════════════════════════════

const CONFIDENCE_THRESHOLD = 0.3;
const RERANK_TOP_N = 6;
const INITIAL_SEARCH_K = 15;

/**
 * Context for building enriched queries
 */
export interface SearchContext {
  hubs_included?: string;
  subscription_levels?: string;
  overall_goals?: string;
  hub_specific_details?: string;
  company_info?: string;
}

/**
 * Detects which Hubs are included from the hubs_included text
 */
function detectHubsFromContext(context: SearchContext): {
  sales: boolean;
  marketing: boolean;
  service: boolean;
} {
  const text = (context.hubs_included || '').toLowerCase();
  return {
    sales: text.includes('sales'),
    marketing: text.includes('marketing'),
    service: text.includes('service'),
  };
}

/**
 * Extracts subscription level from context
 */
function extractLevelFromContext(context: SearchContext): string {
  const text = (context.subscription_levels || '').toLowerCase();
  if (text.includes('enterprise')) return 'Enterprise';
  if (text.includes('professional')) return 'Professional';
  if (text.includes('starter')) return 'Starter';
  if (text.includes('free')) return 'Free';
  return 'Professional';
}

/**
 * Extracts key features/goals from text for query enrichment
 */
function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];
  const lower = text.toLowerCase();

  const featurePatterns = [
    'pipeline',
    'deal',
    'automation',
    'workflow',
    'lead scoring',
    'lead assignment',
    'forms',
    'landing page',
    'email',
    'nurturing',
    'sequences',
    'templates',
    'snippets',
    'documents',
    'quotes',
    'forecast',
    'reporting',
    'dashboard',
    'ticket',
    'knowledge base',
    'chatbot',
    'live chat',
    'inbox',
    'survey',
    'csat',
    'nps',
    'contact',
    'company',
    'properties',
    'lifecycle',
    'tracking code',
    'ads',
    'social media',
    'blog',
    'seo',
    'organize',
    'automate',
    'reduce manual',
    'qualification',
    'follow-up',
    'visibility',
    'roi',
    'conversion',
    'onboarding',
  ];

  for (const pattern of featurePatterns) {
    if (lower.includes(pattern)) {
      terms.push(pattern);
    }
  }

  return [...new Set(terms)].slice(0, 10);
}

/**
 * Builds a SINGLE enriched query from context (instead of multiple queries)
 */
function buildEnrichedQuery(context: SearchContext): string {
  const hubs = detectHubsFromContext(context);
  const level = extractLevelFromContext(context);

  const goalTerms = extractKeyTerms(context.overall_goals || '');
  const detailTerms = extractKeyTerms(context.hub_specific_details || '');
  const allTerms = [...new Set([...goalTerms, ...detailTerms])];

  const parts: string[] = [];

  if (hubs.sales) {
    parts.push('Sales Hub');
    const salesTerms = allTerms.filter((t) =>
      [
        'pipeline',
        'deal',
        'automation',
        'workflow',
        'lead',
        'sequence',
        'template',
        'forecast',
        'reporting',
      ].some((k) => t.includes(k)),
    );
    if (salesTerms.length > 0) parts.push(...salesTerms.slice(0, 3));
  }

  if (hubs.marketing) {
    parts.push('Marketing Hub');
    const marketingTerms = allTerms.filter((t) =>
      [
        'lead',
        'scoring',
        'form',
        'landing',
        'email',
        'nurturing',
        'workflow',
        'automation',
        'conversion',
      ].some((k) => t.includes(k)),
    );
    if (marketingTerms.length > 0) parts.push(...marketingTerms.slice(0, 3));
  }

  if (hubs.service) {
    parts.push('Service Hub');
    const serviceTerms = allTerms.filter((t) =>
      [
        'ticket',
        'knowledge',
        'chatbot',
        'live chat',
        'survey',
        'csat',
        'nps',
      ].some((k) => t.includes(k)),
    );
    if (serviceTerms.length > 0) parts.push(...serviceTerms.slice(0, 3));
  }

  if (parts.length === 0) {
    parts.push('HubSpot implementation');
  }

  parts.push(`${level} plan setup configuration`);

  return parts.join(' ');
}

/**
 * Enhanced search with query enrichment + re-ranking
 * Replaces multiple searches with a single optimized search + re-rank
 */
export async function enhancedSearch(
  context: SearchContext,
  userQuery?: string,
): Promise<{
  chunks: RetrievedChunk[];
  queryUsed: string;
  embeddingTokens: number;
  rerankTokens: number;
  confidence: number;
}> {
  const store = await getPineconeStore();
  if (!store) {
    throw new Error('Pinecone store not available');
  }

  const embeddings = getEmbeddings();

  // Step 1: Build enriched query (single query instead of multiple)
  const enrichedQuery = buildEnrichedQuery(context);
  const finalQuery =
    userQuery && userQuery.length > 10
      ? `${enrichedQuery} ${userQuery}`
      : enrichedQuery;

  console.log('[RAG Enhanced] Query:', finalQuery);

  // Step 2: Initial semantic search (get more results than needed for re-ranking)
  const queryEmbedding = await embeddings.embedQuery(finalQuery);
  const embeddingTokens = Math.ceil(finalQuery.length / 4);

  const initialResults = await store.similaritySearchVectorWithScore(
    queryEmbedding,
    INITIAL_SEARCH_K,
    { type: 'knowledge' },
  );

  console.log(`[RAG Enhanced] Initial results: ${initialResults.length}`);

  if (initialResults.length === 0) {
    return {
      chunks: [],
      queryUsed: finalQuery,
      embeddingTokens,
      rerankTokens: 0,
      confidence: 0,
    };
  }

  // Step 3: Re-rank with Cohere
  const documents = initialResults.map(
    ([doc, _]) =>
      new Document({
        pageContent: doc.pageContent,
        metadata: doc.metadata || {},
      }),
  );

  const reranker = new CohereRerank({
    apiKey: process.env.COHERE_API_KEY,
    model: 'rerank-english-v3.0',
    topN: RERANK_TOP_N,
  });

  const rerankStart = Date.now();
  const rerankedResults = await reranker.rerank(documents, finalQuery, {
    topN: RERANK_TOP_N,
  });
  const rerankTokens = Math.ceil((Date.now() - rerankStart) / 100); // Approximate

  console.log(`[RAG Enhanced] Re-ranked: ${rerankedResults.length} documents`);

  // Step 4: Build final chunks with re-rank scores
  const chunks: RetrievedChunk[] = rerankedResults.map((result, index) => {
    const doc = documents[result.index];
    return {
      id: `${doc.metadata?.guideId || 'guide'}-${doc.metadata?.chunkIndex || index}`,
      content: doc.pageContent,
      source: doc.metadata?.source || 'unknown',
      guideTitle: doc.metadata?.guideTitle || 'Guide',
      sectionType: doc.metadata?.sectionType || 'guide',
      chunkIndex: doc.metadata?.chunkIndex || index,
      score: result.relevanceScore,
    };
  });

  // Step 5: Apply confidence threshold
  const filteredChunks = chunks.filter(
    (c) => (c.score || 0) >= CONFIDENCE_THRESHOLD,
  );
  const confidence =
    filteredChunks.length > 0
      ? filteredChunks.reduce((sum, c) => sum + (c.score || 0), 0) /
        filteredChunks.length
      : 0;

  console.log(
    `[RAG Enhanced] Final chunks: ${filteredChunks.length}, confidence: ${confidence.toFixed(3)}`,
  );

  return {
    chunks: filteredChunks,
    queryUsed: finalQuery,
    embeddingTokens,
    rerankTokens,
    confidence,
  };
}
