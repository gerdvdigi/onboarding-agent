/**
 * Script to delete and recreate Pinecone index
 * Useful if you need to change the embedding model or dimensions
 * 
 * Usage:
 *   pnpm ts-node src/scripts/recreate-pinecone-index.ts
 */

import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function recreateIndex() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME || 'hubspot-cases';

  if (!apiKey) {
    console.error('❌ PINECONE_API_KEY not configured');
    process.exit(1);
  }

  const pinecone = new Pinecone({
    apiKey,
  });

  try {
    console.log(`🗑️  Deleting existing index: ${indexName}...`);
    
    // List indexes
    const indexes = await pinecone.listIndexes();
    const indexExists = indexes.indexes?.some((idx) => idx.name === indexName);

    if (indexExists) {
      await pinecone.deleteIndex(indexName);
      console.log(`✅ Index ${indexName} deleted`);
      
      // Wait for complete deletion
      console.log('⏳ Waiting for complete deletion...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      console.log(`ℹ️  Index ${indexName} does not exist, nothing to delete`);
    }

    console.log(`\n🔨 Creating new index: ${indexName}...`);
    
    // Get dimensions according to provider
    const provider = process.env.EMBEDDING_PROVIDER || 'openai';
    let dimension = 1536; // default OpenAI
    
    switch (provider) {
      case 'voyage':
        const voyageModel = process.env.VOYAGE_MODEL || 'voyage-2';
        dimension = voyageModel.includes('large') ? 1536 : 1024;
        console.log(`📐 Using dimensions for Voyage AI (${voyageModel}): ${dimension}`);
        break;
      case 'cohere':
        dimension = 1024;
        console.log(`📐 Using dimensions for Cohere: ${dimension}`);
        break;
      case 'huggingface':
        const hfModel = process.env.HUGGINGFACE_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
        dimension = hfModel.includes('e5-base') ? 768 : 384;
        console.log(`📐 Using dimensions for HuggingFace (${hfModel}): ${dimension}`);
        break;
      case 'ollama':
        dimension = 768;
        console.log(`📐 Using dimensions for Ollama: ${dimension}`);
        break;
      case 'openai':
      default:
        const openaiModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002';
        dimension = openaiModel.includes('large') ? 3072 : 1536;
        console.log(`📐 Using dimensions for OpenAI (${openaiModel}): ${dimension}`);
    }
    
    await pinecone.createIndex({
      name: indexName,
      dimension,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });

    console.log(`✅ Index ${indexName} created successfully`);
    console.log('\n📝 Now run: pnpm ts-node src/scripts/init-pinecone.ts');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

recreateIndex();
