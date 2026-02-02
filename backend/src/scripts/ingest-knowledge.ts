/**
 * Ingest onboarding / implementation guide into Pinecone as knowledge chunks.
 * Uses LangChain + Pinecone directly (no Nest). Load .env from backend root.
 *
 * Usage: pnpm run ingest-knowledge <file-path>
 * Example: pnpm run ingest-knowledge ~/Downloads/guide.md
 *
 * Supports: .md, .markdown, .txt, .html, .htm
 * Chunks use metadata type: 'knowledge' for search_company_knowledge.
 */

import 'dotenv/config';
import { Document } from '@langchain/core/documents';
import { getPineconeStore } from '../langchain/vector-store/pinecone-store';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

function htmlToMarkdown(html: string): string {
  let markdown = html;
  markdown = markdown.replace(
    /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi,
    '[$2]($1)',
  );
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n');
  markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ul>/gi, '\n');
  markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
  markdown = markdown.replace(/<\/ol>/gi, '\n');
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  markdown = markdown.replace(/<[^>]+>/g, '');
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  markdown = markdown.replace(/[ \t]+/g, ' ');
  return markdown.trim();
}

function processContent(filePath: string, content: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '.htm') {
    console.log('📄 HTML detected, converting to Markdown...');
    return htmlToMarkdown(content);
  }
  if (ext === '.md' || ext === '.markdown') {
    console.log('📄 Markdown detected.');
    return content;
  }
  if (ext === '.txt') {
    console.log('📄 Plain text detected.');
    return content;
  }
  console.log(`📄 Format ${ext} not recognized, treating as plain text.`);
  return content;
}

/**
 * Split text into chunks with overlap (no external splitter).
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized.length) return chunks;
  while (start < normalized.length) {
    let end = start + chunkSize;
    if (end < normalized.length) {
      const nextNewline = normalized.indexOf('\n', end);
      if (nextNewline !== -1 && nextNewline - end < 200) {
        end = nextNewline + 1;
      } else {
        const lastSpace = normalized.lastIndexOf(' ', end);
        if (lastSpace > start) end = lastSpace + 1;
      }
    } else {
      end = normalized.length;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function run() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  if (args.length === 0) {
    console.error('❌ Error: Provide the guide file path.');
    console.log('\nUsage:');
    console.log(
      '  pnpm exec ts-node -r tsconfig-paths/register src/scripts/ingest-knowledge.ts <file-path>',
    );
    console.log('\nExample:');
    console.log(
      '  pnpm exec ts-node -r tsconfig-paths/register src/scripts/ingest-knowledge.ts ./docs/onboarding-guide.md',
    );
    process.exit(1);
  }

  const rawPath = args[0];
  const expandedPath = rawPath.startsWith('~')
    ? path.join(os.homedir(), rawPath.slice(1))
    : rawPath;
  const filePath = path.resolve(process.cwd(), expandedPath);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error('\n   Tip: Paths are relative to the backend folder. For your user Downloads use:');
    console.error('   pnpm run ingest-knowledge ~/Downloads/ImplementationPlanExampleFormat.md');
    process.exit(1);
  }

  console.log(`📖 Ingesting knowledge from: ${filePath}\n`);

  const rawContent = fs.readFileSync(filePath, 'utf-8');
  if (!rawContent.trim()) {
    console.error('❌ File is empty.');
    process.exit(1);
  }

  const content = processContent(filePath, rawContent);
  const chunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);
  console.log(`✅ Split into ${chunks.length} chunks (size ${CHUNK_SIZE}, overlap ${CHUNK_OVERLAP}).\n`);

  const fileName = path.basename(filePath, path.extname(filePath));
  const guideTitle = fileName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const documents: Document[] = chunks.map((pageContent, i) => {
    return new Document({
      pageContent,
      metadata: {
        type: 'knowledge',
        source: filePath,
        guideTitle,
        guideId: fileName.toLowerCase().replace(/\s+/g, '-'),
        sectionType: 'guide',
        chunkIndex: i,
      },
    });
  });

  const store = await getPineconeStore();
  if (!store) {
    console.error('❌ Pinecone not available. Set PINECONE_API_KEY and COHERE_API_KEY in .env');
    process.exit(1);
  }

  console.log('🔄 Uploading chunks to Pinecone...');
  const ids = await store.addDocuments(documents);
  console.log(`\n✨ Done. ${ids.length} chunks indexed.\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
