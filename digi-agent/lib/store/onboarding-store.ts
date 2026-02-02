import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserInfo, ImplementationPlan, OnboardingContext } from "@/lib/langchain/agent";

interface OnboardingStore {
  // Paso 1: Información básica
  userInfo: UserInfo | null;
  setUserInfo: (info: UserInfo) => void;

  // Paso 2: Chat y descubrimiento
  messages: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>;
  addMessage: (role: "user" | "assistant", content: string) => void;
  clearMessages: () => void;

  // Contexto del onboarding
  context: OnboardingContext;
  updateContext: (updates: Partial<OnboardingContext>) => void;

  // Paso 3: Plan aprobado
  approvedPlan: ImplementationPlan | null;
  /** Full plan text as shown in chat (Markdown). Used for PDF so it matches what the user saw. */
  approvedPlanFullText: string | null;
  setApprovedPlan: (plan: ImplementationPlan, fullText?: string | null) => void;

  // Estado del flujo
  currentStep: 1 | 2 | 3;
  setCurrentStep: (step: 1 | 2 | 3) => void;

  // Reset completo
  reset: () => void;
}

const initialContext: OnboardingContext = {
  step: "discovery",
  questionsAsked: [],
  answersCollected: {},
  planReady: false,
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
  userInfo: null,
  setUserInfo: (info) => set({ userInfo: info }),

  messages: [],
  addMessage: (role, content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { role, content, timestamp: new Date() },
      ],
    })),
  clearMessages: () => set({ messages: [] }),

  context: initialContext,
  updateContext: (updates) =>
    set((state) => ({
      context: { ...state.context, ...updates },
    })),

  approvedPlan: null,
  approvedPlanFullText: null,
  setApprovedPlan: (plan, fullText) =>
    set({ approvedPlan: plan, approvedPlanFullText: fullText ?? null }),

  currentStep: 1,
  setCurrentStep: (step) => set({ currentStep: step }),

  reset: () =>
    set({
      userInfo: null,
      messages: [],
      context: initialContext,
      approvedPlan: null,
      approvedPlanFullText: null,
      currentStep: 1,
    }),
    }),
    {
      name: "onboarding-storage",
      // Only persist essential data, not the full message history
      partialize: (state) => ({
        userInfo: state.userInfo,
        approvedPlan: state.approvedPlan,
        approvedPlanFullText: state.approvedPlanFullText,
        currentStep: state.currentStep,
        context: state.context,
        messages: state.messages.slice(-20),
      }),
    }
  )
);
