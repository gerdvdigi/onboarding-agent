import { BaseMessage } from '@langchain/core/messages';

export interface UserInfo {
  name: string;
  lastName: string;
  email: string;
  company: string;
  website: string;
  terms: boolean;
}

export interface RAGMetrics {
  citationCoverage: number;
  originalityScore: number;
  hallucinationScore: number;
  totalCitations: number;
  evaluatedAt: string;
}

export interface ImplementationPlan {
  company: string;
  objectives: string[];
  modules: {
    name: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }[];
  timeline: string;
  recommendations: string[];
  /** Hubs activos (de parseActiveHubs). Usado por plan-approved para HubSpot. */
  hub_sales?: boolean;
  hub_marketing?: boolean;
  hub_services?: boolean;
  ragMetrics?: RAGMetrics;
}

/** Slice of context the client sends in the chat payload. Used to inject structured data into the agent prompt. */
export interface ChatContext {
  answersCollected?: Record<string, string>;
  questionsAsked?: string[];
  planReady?: boolean;
}

export interface OnboardingContext {
  step: 'discovery' | 'plan-review' | 'approved';
  questionsAsked: string[];
  answersCollected: Record<string, string>;
  planReady: boolean;
  planDraft?: ImplementationPlan;
}

export interface OnboardingState {
  messages: BaseMessage[];
  userInfo?: UserInfo;
  context: OnboardingContext;
  nextAction?: 'ask_question' | 'generate_plan' | 'wait_approval' | 'end';
}
