import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { OnboardingAgentService, StreamChatChunk } from './onboarding-agent.service';
import { ChatRequestDto } from '../common/dto/chat.dto';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly onboardingAgentService: OnboardingAgentService,
  ) {}

  @Post()
  async handleChat(@Body() chatRequest: ChatRequestDto, @Res() res: Response) {
    try {
      const { messages, userInfo, context } = chatRequest;

      if (!userInfo) {
        throw new HttpException(
          'UserInfo es requerido',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Configurar headers para SSE (CORS lo maneja main.ts; no sobrescribir Access-Control-Allow-Origin)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const encoder = new TextEncoder();

      try {
        // Usar streaming real del agente (context opcional: answersCollected, questionsAsked, planReady)
        const stream = this.onboardingAgentService.streamChat(
          messages,
          userInfo,
          context,
        );

        for await (const chunk of stream) {
          const c = chunk as StreamChatChunk;
          if (typeof c === 'object' && c !== null && 'type' in c && c.type === 'plan_generated' && 'plan' in c) {
            res.write(
              encoder.encode(`data: ${JSON.stringify({ type: 'plan_generated', plan: c.plan })}\n\n`),
            );
            continue;
          }
          const chunkStr = typeof c === 'string' ? c : '';
          if (chunkStr.trim().length > 0) {
            if (chunkStr.length > 0) {
              console.log(`[Backend] Enviando chunk: "${chunkStr.substring(0, 100)}${chunkStr.length > 100 ? '...' : ''}"`);
            }
            res.write(
              encoder.encode(`data: ${JSON.stringify({ type: 'message', content: chunkStr })}\n\n`),
            );
          }
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
              error: error instanceof Error ? error.message : 'Error desconocido',
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
