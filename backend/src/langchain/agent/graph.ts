import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage } from '@langchain/core/messages';
import { ConsoleCallbackHandler } from '@langchain/core/tracers/console';
import { createAgent } from 'langchain';
import { UserInfo, ChatContext, ImplementationPlan } from '../../common/types/onboarding.types';
import {
  detectPlanReadyTool,
  generatePlanDraftTool,
  searchKnowledgeBaseTool,
} from '../tools';
import { setPlanGeneratedListener } from '../tools/generate-plan-draft';
import { getSystemPrompt } from '../prompts/system-prompt';
import { langchainConfig, getOpenAIApiKey } from '../config';
import { normalizeAnswersToPillars } from '../request-context';

// 1. Array of English-native tools
const tools = [detectPlanReadyTool, searchKnowledgeBaseTool, generatePlanDraftTool];

export async function* streamOnboardingAgent(
  messages: BaseMessage[],
  userInfo?: UserInfo,
  context?: ChatContext,
) {
  const llm = new ChatOpenAI({
    modelName: langchainConfig.model.name,
    temperature: langchainConfig.model.temperature,
    streaming: true,
    openAIApiKey: getOpenAIApiKey(),
  });

  const systemPrompt = getSystemPrompt(
    userInfo
      ? {
          company: userInfo.company,
          website: userInfo.website,
          email: userInfo.email,
          
        }
      : undefined,
  );

  // 2. Inject context: bullet list + explicit JSON so the agent can pass answersCollected to tools
  const normalizedAnswers = normalizeAnswersToPillars(context?.answersCollected);
  const hasDiscovery = Object.values(normalizedAnswers).some((v) => v.trim().length > 0);
  if (hasDiscovery) {
    const formattedDiscovery = Object.entries(normalizedAnswers)
      .filter(([, v]) => v && String(v).trim())
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');
    const answersJson = JSON.stringify(normalizedAnswers);
    messages.unshift({
      role: 'system',
      content: `CURRENT DISCOVERY STATE:\n${formattedDiscovery}\n\nWhen you call detect_plan_ready, search_company_knowledge, or generate_plan_draft, you MUST pass answersCollected. Use this exact object (copy it):\n\`\`\`json\n${answersJson}\n\`\`\``,
    } as any);
  }

  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt: systemPrompt,
  });

  let capturedPlan: ImplementationPlan | null = null;

  // 3. Listener to capture the event from generate_plan_draft tool
  setPlanGeneratedListener((plan) => {
    capturedPlan = plan;
  });

  try {
    const stream = await agent.stream(
      { messages },
      {
        streamMode: 'messages',
        callbacks: [new ConsoleCallbackHandler()],
      },
    );

    for await (const [message_chunk] of stream) {
      if (message_chunk) {
        let content = '';
        
        // Handle both standard content and content blocks
        if (message_chunk.contentBlocks && Array.isArray(message_chunk.contentBlocks)) {
          content = message_chunk.contentBlocks
            .map((block: any) => block?.text || block?.content || (typeof block === 'string' ? block : ''))
            .filter(Boolean)
            .join('');
        } else if (message_chunk.content) {
          content = typeof message_chunk.content === 'string' 
            ? message_chunk.content 
            : String(message_chunk.content);
        }

        if (!content) continue;

        const trimmed = content.trim();

        // 4. CLEANING FILTERS (Strictly English)
        // Skip technical tool outputs if they accidentally leak into the text stream
        if (trimmed.startsWith('{') || trimmed.startsWith('["') || trimmed.includes('"company":')) continue;
        
        // Safety net: Never show raw internal knowledge or RAG markers
        if (content.includes('[INTERNAL KNOWLEDGE]') || content.includes('TECHNICAL_CONTEXT:')) continue;
        // Block RAG tool output from ever reaching the user (excerpts, guide labels, etc.)
        const ragLeakMarkers = [
          'Retrieved knowledge highlights',
          'RAG-based implementation guidance',
          'Implementation guidance from the knowledge base',
          'Use these knowledge excerpts',
          'ImplementationPlanExampleFormat',
          'key excerpt:',
          '[guide]',
          '[INTERNAL USE ONLY',
        ];
        if (ragLeakMarkers.some((m) => content.includes(m))) continue;
        
        // Skip tool errors to handle them gracefully in the background
        if (/\\bError invoking tool\\b|with error:\\s*Error:/i.test(content)) continue;

        yield content;
      }
    }

    // 5. Final Step: Emit the structured plan if it was generated
    if (capturedPlan) {
      yield { type: 'plan_generated' as const, plan: capturedPlan };
    }
  } catch (error) {
    console.error('[Graph] Stream error:', error);
    throw error;
  } finally {
    // Reset listener for the next request
    setPlanGeneratedListener(null);
  }
}