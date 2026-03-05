/** Frontend types aligned with backend onboarding.types */

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
  hub_sales?: boolean;
  hub_marketing?: boolean;
  hub_services?: boolean;
}

export interface OnboardingContext {
  step: "discovery" | "plan-review" | "approved";
  questionsAsked: string[];
  answersCollected: Record<string, string>;
  planReady: boolean;
  planDraft?: ImplementationPlan;
}
