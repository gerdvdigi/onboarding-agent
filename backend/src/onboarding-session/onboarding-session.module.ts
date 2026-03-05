import { Module } from '@nestjs/common';
import { OnboardingSessionController } from './onboarding-session.controller';
import { ConversationsController } from './conversations.controller';
import { OnboardingSessionService } from './onboarding-session.service';
import { OnboardingSessionRepository } from './onboarding-session.repository';
import { ConversationRepository } from './conversation.repository';
import { OnboardingSessionGuard } from './onboarding-session.guard';
import { MailModule } from '../mail/mail.module';
import { HubSpotModule } from '../hubspot/hubspot.module';

@Module({
  imports: [MailModule, HubSpotModule],
  controllers: [OnboardingSessionController, ConversationsController],
  providers: [
    OnboardingSessionRepository,
    ConversationRepository,
    OnboardingSessionService,
    OnboardingSessionGuard,
  ],
  exports: [
    OnboardingSessionService,
    OnboardingSessionGuard,
    ConversationRepository,
  ],
})
export class OnboardingSessionModule {}
