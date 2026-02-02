import { BaseMessage } from '@langchain/core/messages';

export interface UserInfo {
  name: string;
  lastName: string;
  email: string;
  company: string;
  website: string;
  terms: boolean;
}

export interface ImplementationPlan {
  company: string;
  objectives: string[];
  modules: {
    name: string;
    description: string;
    priority: "high" | "medium" | "low";
  }[];
  timeline: string;
  recommendations: string[];
}

/** Slice of context the client sends in the chat payload. Used to inject structured data into the agent prompt. */
export interface ChatContext {
  answersCollected?: Record<string, string>;
  questionsAsked?: string[];
  planReady?: boolean;
}

export interface OnboardingContext {
  step: "discovery" | "plan-review" | "approved";
  questionsAsked: string[];
  answersCollected: Record<string, string>;
  planReady: boolean;
  planDraft?: ImplementationPlan;
}

export interface OnboardingState {
  messages: BaseMessage[];
  userInfo?: UserInfo;
  context: OnboardingContext;
  nextAction?: "ask_question" | "generate_plan" | "wait_approval" | "end";
}
