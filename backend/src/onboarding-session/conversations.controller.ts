import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  OnboardingSessionGuard,
  getOnboardingSessionFromRequest,
} from './onboarding-session.guard';
import { ConversationRepository } from './conversation.repository';
import { HubSpotService } from '../hubspot/hubspot.service';
import { formatNoteCreated } from '../hubspot/hubspot-note-format';

@Controller('onboarding/conversations')
@UseGuards(OnboardingSessionGuard)
export class ConversationsController {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly hubSpotService: HubSpotService,
  ) {}

  @Get()
  async list(@Req() req: Request) {
    const session = getOnboardingSessionFromRequest(req);
    const rows = await this.conversationRepo.findBySessionId(session.id);
    return {
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
      })),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() body: { title?: string }) {
    const session = getOnboardingSessionFromRequest(req);
    const row = await this.conversationRepo.create(session.id, body.title);
    const noteBody = formatNoteCreated(
      row.title,
      session.userInfo?.website?.trim() || undefined,
    );
    const noteId = await this.hubSpotService.createNote(session.email, noteBody);
    if (noteId) {
      await this.conversationRepo.updateHubspotNoteId(row.id, noteId);
    }
    const conversationsCount = await this.conversationRepo.countBySessionId(
      session.id,
    );
    await this.hubSpotService.updateContactProperties(session.email, {
      conversations_count: conversationsCount,
      last_conversation_at: new Date().toISOString(),
    });
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: Request, @Param('id') id: string) {
    const session = getOnboardingSessionFromRequest(req);
    const conv = await this.conversationRepo.findByIdAndSession(id, session.id);
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }
    await this.conversationRepo.delete(id);
  }
}
