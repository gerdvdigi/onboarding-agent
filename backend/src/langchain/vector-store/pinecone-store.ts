/**
 * Simple LangChain + Pinecone vector store (official pattern).
 * No Nest – use env vars. Embeddings: Cohere (default). Same store for ingest and search_company_knowledge.
 *
 * @see https://docs.pinecone.io/integrations/langchain
 * @see https://js.langchain.com/docs/integrations/vectorstores/pinecone
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { CohereEmbeddings } from '@langchain/cohere';
import type { Embeddings } from '@langchain/core/embeddings';

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'hubspot-cases';
const COHERE_DIMENSION = 1024; // embed-english-v3.0

let storeInstance: PineconeStore | null = null;

function getEmbeddings(): Embeddings {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error('COHERE_API_KEY is required for embeddings.');
  return new CohereEmbeddings({
    apiKey,
    model: process.env.COHERE_MODEL || 'embed-english-v3.0',
  });
}

/**
 * Lazy singleton: creates Pinecone client + index (if missing) + LangChain PineconeStore.
 * Returns null if PINECONE_API_KEY is not set.
 */
export async function getPineconeStore(): Promise<PineconeStore | null> {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) return null;

  if (storeInstance) return storeInstance;

  const pinecone = new Pinecone({ apiKey });
  const indexes = await pinecone.listIndexes();
  const exists = indexes.indexes?.some((i) => i.name === INDEX_NAME);

  if (!exists) {
    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: COHERE_DIMENSION,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    // Serverless index can take a few seconds to be ready
    await new Promise((r) => setTimeout(r, 2000));
  }

  const index = pinecone.index(INDEX_NAME);
  const embeddings = getEmbeddings();
  storeInstance = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
    maxConcurrency: 5,
  });

  return storeInstance;
}
