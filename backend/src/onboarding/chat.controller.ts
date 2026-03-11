import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Query,
  HttpStatus,
  HttpException,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OnboardingAgentService } from './onboarding-agent.service';
import { ChatRequestDto } from '../common/dto/chat.dto';
import {
  ClerkSessionGuard,
  getOnboardingSessionFromRequest,
} from '../onboarding-session/clerk-session.guard';
import { OnboardingSessionService } from '../onboarding-session/onboarding-session.service';
import { ConversationRepository } from '../onboarding-session/conversation.repository';
import {
  HubSpotService
} from '../hubspot/hubspot.service';
import { formatNoteDiscoveryStarted } from '../hubspot/hubspot-note-format';
import { getDiscoveryProgress } from '../hubspot/discovery-progress';
import { deriveAnswersFromHistory } from '../langchain/utils/derive-answers-from-history';
import { ChatMessageRepository } from './chat-message.repository';

@Controller('chat')
@UseGuards(ClerkSessionGuard)
export class ChatController {
  constructor(
    private readonly onboardingAgentService: OnboardingAgentService,
    private readonly hubSpotService: HubSpotService,
    private readonly sessionService: OnboardingSessionService,
    private readonly chatMessageRepository: ChatMessageRepository,
    private readonly conversationRepo: ConversationRepository,
  ) {}

  /** Returns conversation history for the given conversation (must belong to session). */
  @Get('messages')
  async getMessages(
    @Req() req: Request,
    @Query('conversationId') conversationId: string | undefined,
  ) {
    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }
    const session = getOnboardingSessionFromRequest(req);
    const conv = await this.conversationRepo.findByIdAndSession(
      conversationId,
      session.id,
    );
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }
    const rows =
      await this.chatMessageRepository.findByConversationId(conversationId);
    return {
      messages: rows.map((r) => ({
        role: r.role as 'user' | 'assistant',
        content: r.content,
        timestamp: r.createdAt,
      })),
    };
  }

  @Post()
  async handleChat(
    @Body() chatRequest: ChatRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const { conversationId, messages, userInfo, context } = chatRequest;

      if (!userInfo) {
        throw new HttpException(
          'UserInfo es requerido',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!conversationId) {
        throw new BadRequestException('conversationId is required');
      }

      const session = getOnboardingSessionFromRequest(req);
      const conv = await this.conversationRepo.findByIdAndSession(
        conversationId,
        session.id,
      );
      if (!conv) {
        throw new NotFoundException('Conversation not found');
      }

      // Persist conversation history to DB (sync what the client sent)
      await this.chatMessageRepository.replaceAllForConversation(
        conversationId,
        messages.map((m) => ({ role: m.role, content: m.content })),
      );

      const now = new Date().toISOString();

      const derived = deriveAnswersFromHistory(
        messages.map((m) => ({ role: m.role, content: m.content })),
      );
      const mergedAnswers = {
        ...context?.answersCollected,
        ...derived.answersCollected,
      };
      const { percentage } = getDiscoveryProgress(
        messages.map((m) => ({ role: m.role, content: m.content })),
        mergedAnswers,
      );
      const hubsText = mergedAnswers.hubs_included ?? '';
      const hubsList: string[] = [];
      if (/\bsales\b/i.test(hubsText)) hubsList.push('Sales Hub');
      if (/\bmarketing\b/i.test(hubsText)) hubsList.push('Marketing Hub');
      if (/\bservice\b/i.test(hubsText)) hubsList.push('Service Hub');
      const hubsStr = hubsList.length > 0 ? hubsList.join(', ') : undefined;

      await this.conversationRepo.updateDiscoveryData(conversationId, {
        answersCollected:
          Object.keys(mergedAnswers).length > 0 ? mergedAnswers : undefined,
        discoveryPercentage: percentage,
        hubs: hubsStr,
      });

      const conversationsCount = await this.conversationRepo.countBySessionId(
        session.id,
      );
      await this.hubSpotService.updateContactProperties(userInfo.email, {
        last_onboarding_activity_at: now,
        last_conversation_at: now,
        conversations_count: conversationsCount,
      });
        const noteBody = formatNoteDiscoveryStarted({
          conversationTitle: conv.title,
          hubs: hubsStr,
          answersCollected:
            Object.keys(mergedAnswers).length > 0 ? mergedAnswers : undefined,
          discoveryPercentage: percentage,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });
        const r = conv as { hubspotNoteId?: string | null };
        if (r.hubspotNoteId) {
          await this.hubSpotService.updateNote(r.hubspotNoteId, noteBody);
        } else {
          const noteId = await this.hubSpotService.createNote(
            userInfo.email,
            noteBody,
          );
          if (noteId) {
            await this.conversationRepo.updateHubspotNoteId(
              conversationId,
              noteId,
            );
          }
        }

      // Configurar headers para SSE (CORS lo maneja main.ts; no sobrescribir Access-Control-Allow-Origin)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const encoder = new TextEncoder();
      let assistantContent = '';

      try {
        // Usar streaming real del agente (context opcional: answersCollected, questionsAsked, planReady)
        const stream = this.onboardingAgentService.streamChat(
          messages,
          userInfo,
          context,
        );

        for await (const chunk of stream) {
          const c = chunk;
          if (typeof c === 'object' && c !== null && 'type' in c) {
            if (c.type === 'plan_generated' && 'plan' in c) {
              res.write(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'plan_generated', plan: c.plan })}\n\n`,
                ),
              );
              continue;
            }
            if (c.type === 'token_usage' && 'usage' in c) {
              res.write(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'token_usage', usage: c.usage })}\n\n`,
                ),
              );
              continue;
            }
          }
          const chunkStr = typeof c === 'string' ? c : '';
          if (chunkStr.trim().length > 0) {
            assistantContent += chunkStr;
            if (chunkStr.length > 0) {
              console.log(
                `[Backend] Enviando chunk: "${chunkStr.substring(0, 100)}${chunkStr.length > 100 ? '...' : ''}"`,
              );
            }
            res.write(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'message', content: chunkStr })}\n\n`,
              ),
            );
          }
        }

        // Persist assistant reply to DB
        if (assistantContent.trim()) {
          await this.chatMessageRepository.insert(
            conversationId,
            'assistant',
            assistantContent.trim(),
          );
        }

        // Finalización
        res.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'end' })}\n\n`),
        );
        res.end();
      } catch (error) {
        console.error('Error en stream:', error);
        res.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error:
                error instanceof Error ? error.message : 'Error desconocido',
            })}\n\n`,
          ),
        );
        res.end();
      }
    } catch (error) {
      console.error('Error en API route:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error desconocido',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
