import { Injectable } from '@nestjs/common';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { streamOnboardingAgent } from '../langchain/agent/graph';
import { UserInfo, ChatContext, ImplementationPlan } from '../common/types/onboarding.types';
import {
  setOnboardingRequestContext,
  clearOnboardingRequestContext,
} from '../langchain/request-context';
import {
  deriveAnswersFromHistory,
  mergeAnswers,
} from '../langchain/utils/derive-answers-from-history';

export type StreamChatChunk = string | { type: 'plan_generated'; plan: ImplementationPlan };

@Injectable()
export class OnboardingAgentService {
  async* streamChat(
    messages: Array<{ role: string; content: string }>,
    userInfo: UserInfo,
    context?: ChatContext,
  ): AsyncGenerator<StreamChatChunk, void, unknown> {
    // Filtrar mensajes duplicados antes de convertir a LangChain
    const seenMessages = new Set<string>();
    const uniqueMessages = messages.filter((msg) => {
      const messageKey = `${msg.role}:${msg.content.trim()}`;
      if (seenMessages.has(messageKey)) {
        console.warn(`[Backend] Mensaje duplicado filtrado: [${msg.role}] ${msg.content.substring(0, 50)}...`);
        return false;
      }
      seenMessages.add(messageKey);
      return true;
    });

    // Validación adicional: Si los últimos dos mensajes del asistente son idénticos, eliminar el duplicado
    const cleanedMessages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < uniqueMessages.length; i++) {
      const current = uniqueMessages[i];
      const previous = uniqueMessages[i - 1];
      
      // Si el mensaje actual es del asistente y es idéntico al anterior, saltarlo
      if (
        current.role === 'assistant' &&
        previous &&
        previous.role === 'assistant' &&
        current.content.trim() === previous.content.trim()
      ) {
        console.warn(`[Backend] Mensaje del asistente duplicado consecutivo detectado y filtrado`);
        continue;
      }
      
      cleanedMessages.push(current);
    }

    // Convertir mensajes al formato de LangChain
    const langchainMessages = cleanedMessages.map((msg) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      }
      return new AIMessage(msg.content);
    });

    // Debug: Log del historial completo
    console.log(`[Backend] ========================================`);
    console.log(`[Backend] Procesando ${langchainMessages.length} mensajes del historial`);
    console.log(`[Backend] Historial completo:`);
    langchainMessages.forEach((msg, idx) => {
      const role = msg instanceof HumanMessage ? 'USER' : 'ASSISTANT';
      const content =
        typeof msg.content === 'string'
          ? msg.content.substring(0, 100) +
            (msg.content.length > 100 ? '...' : '')
          : JSON.stringify(msg.content).substring(0, 100);
      console.log(`[Backend]   ${idx + 1}. [${role}]: ${content}`);
    });
    console.log(`[Backend] ========================================`);

    // DERIVE answersCollected from message history (don't depend on frontend)
    const derived = deriveAnswersFromHistory(cleanedMessages);
    const mergedAnswers = mergeAnswers(derived.answersCollected, context?.answersCollected);
    const mergedQuestionsAsked = derived.questionsAsked.length > 0
      ? derived.questionsAsked
      : context?.questionsAsked ?? [];

    // Build the enriched context
    const enrichedContext: ChatContext = {
      ...context,
      answersCollected: mergedAnswers,
      questionsAsked: mergedQuestionsAsked,
      planReady: context?.planReady || Object.keys(mergedAnswers).length >= 5,
    };

    // Log derived context
    console.log(`[Backend] Derived answersCollected from history:`);
    for (const [key, value] of Object.entries(mergedAnswers)) {
      const preview = value.length > 80 ? value.substring(0, 80) + '...' : value;
      console.log(`[Backend]   - ${key}: "${preview}"`);
    }
    console.log(`[Backend] Questions asked: ${mergedQuestionsAsked.length}`);
    console.log(`[Backend] ========================================`);

    // Set request context for tools and start streaming
    setOnboardingRequestContext(enrichedContext);
    const stream = streamOnboardingAgent(langchainMessages, userInfo, enrichedContext);

    let totalContent = '';

    try {
      for await (const chunk of stream) {
        if (typeof chunk === 'object' && chunk !== null && 'type' in chunk && chunk.type === 'plan_generated' && 'plan' in chunk) {
          yield { type: 'plan_generated', plan: chunk.plan };
          continue;
        }
        const token = typeof chunk === 'string' ? chunk : '';
        if (token.length > 0) {
          totalContent += token;
          if (totalContent.length <= 100) {
            console.log(`[Backend] Token recibido: "${token}"`);
          }
          yield token;
        }
      }
    } finally {
      clearOnboardingRequestContext();
    }

    // Log final del contenido completo
    if (totalContent) {
      console.log(`[Backend] Contenido completo final (${totalContent.length} chars): "${totalContent.substring(0, 200)}${totalContent.length > 200 ? '...' : ''}"`);
    }
  }
}
