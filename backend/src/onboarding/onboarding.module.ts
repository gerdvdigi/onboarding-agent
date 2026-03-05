import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { PdfController } from './pdf.controller';
import { OnboardingAgentService } from './onboarding-agent.service';
import { ChatMessageRepository } from './chat-message.repository';
import { OnboardingSessionModule } from '../onboarding-session/onboarding-session.module';
import { HubSpotModule } from '../hubspot/hubspot.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [OnboardingSessionModule, HubSpotModule, StorageModule],
  controllers: [ChatController, PdfController],
  providers: [OnboardingAgentService, ChatMessageRepository],
  exports: [OnboardingAgentService],
})
export class OnboardingModule {}
