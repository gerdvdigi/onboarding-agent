/**
 * Inspect Pinecone knowledge base contents.
 * Runs sample queries and prints full chunk content (no truncation) to verify:
 * - URLs are present in chunks
 * - Chunk sizes and structure
 * - What the LLM actually receives from RAG
 *
 * Usage: pnpm run inspect-pinecone
 * Or: pnpm exec ts-node -r tsconfig-paths/register src/scripts/inspect-pinecone.ts
 */

import 'dotenv/config';
import { getPineconeStore } from '../langchain/vector-store/pinecone-store';

const SAMPLE_QUERIES = [
  'Sales Hub Professional pipeline deal automation',
  'Marketing Hub lead scoring forms tracking code',
  'HubSpot implementation plan setup configuration',
];

async function run() {
  console.log('🔍 Inspecting Pinecone knowledge base...\n');

  const store = await getPineconeStore();
  if (!store) {
    console.error(
      '❌ Pinecone not available. Set PINECONE_API_KEY and COHERE_API_KEY in .env',
    );
    process.exit(1);
  }

  const seenContent = new Set<string>();

  for (const query of SAMPLE_QUERIES) {
    console.log('═'.repeat(70));
    console.log(`📌 Query: "${query}"`);
    console.log('═'.repeat(70));

    const docs = await store.similaritySearch(query, 3, { type: 'knowledge' });

    if (docs.length === 0) {
      console.log('   (no results)\n');
      continue;
    }

    docs.forEach((doc, i) => {
      const contentKey = doc.pageContent?.substring(0, 80) || '';
      if (seenContent.has(contentKey)) return;
      seenContent.add(contentKey);

      const meta = (doc.metadata || {}) as Record<string, unknown>;

      const content = String(doc.pageContent || '').trim();
      const guideTitle = meta.guideTitle || meta.sectionType || 'Guide';

      console.log(
        `\n--- Chunk ${i + 1} [${guideTitle}] (${content.length} chars) ---\n`,
      );
      console.log(content);
      console.log('');

      // Highlight URLs
      const urlMatches = content.match(/https:\/\/[^\s\)]+/g);
      if (urlMatches?.length) {
        console.log('   📎 URLs found:', urlMatches.length);
        urlMatches.forEach((u) => console.log('      ', u));
      } else {
        console.log('   ⚠️  No URLs in this chunk');
      }
      console.log('');
    });
  }

  console.log('═'.repeat(70));
  console.log('✅ Inspection complete.');
  console.log('\nCheck: Do chunks contain full HubSpot Knowledge Base URLs?');
  console.log(
    'If not, consider re-ingesting with a guide that includes markdown links.',
  );
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
