import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { PdfController } from './pdf.controller';
import { OnboardingAgentService } from './onboarding-agent.service';

@Module({
  controllers: [ChatController, PdfController],
  providers: [OnboardingAgentService],
  exports: [OnboardingAgentService],
})
export class OnboardingModule {}
