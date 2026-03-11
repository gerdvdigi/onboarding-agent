"use client";

import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import { getApiBaseUrl, getAuthFetchOptions } from "@/lib/config/api";
import { useAuth } from "@clerk/nextjs";
import { Download, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ImplementationPackages } from "./ImplementationPackages";

export function FinalizationStep() {
  const { getToken } = useAuth();
  const { approvedPlan, approvedPlanFullText, approvedConversationId, userInfo } =
    useOnboardingStore();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  useEffect(() => {
    if (approvedPlan) {
      generatePDF();
    }
  }, [approvedPlan, getToken]);

  const generatePDF = async () => {
    if (!approvedPlan || !userInfo) return;
    setPdfError(null);
    setIsLoadingPdf(true);
    try {
      const opts = await getAuthFetchOptions(getToken);
      const response = await fetch(`${getApiBaseUrl()}/generate-pdf`, {
        method: "POST",
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers as Record<string, string>),
        },
        body: JSON.stringify({
          plan: approvedPlan,
          userInfo,
          fullPlanText: approvedPlanFullText ?? undefined,
          conversationId: approvedConversationId ?? undefined,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        let errMsg = "Error generating PDF";
        try {
          const parsed = JSON.parse(errBody);
          errMsg = parsed.message || parsed.error || errMsg;
        } catch {
          if (errBody) errMsg = errBody.slice(0, 200);
        }
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setPdfError(
        error instanceof Error ? error.message : "Could not generate PDF. Please try again."
      );
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = `implementation-plan-${userInfo?.company || "hubspot"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const noPlanContent = (
    <div className="text-center py-12">
      <p>No approved plan. Please complete the previous steps.</p>
    </div>
  );

  const mainContent = (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
        <h2 className="text-2xl font-bold text-heading">Plan Approved!</h2>
        <p className="text-muted-foreground">
          Your implementation plan has been generated successfully.
        </p>
      </div>

      {pdfError && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-destructive font-medium">{pdfError}</p>
          <p className="text-sm text-muted-foreground mt-1">
            If the plan content is missing, go back to the chat and approve the plan again.
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              setPdfError(null);
              generatePDF();
            }}
          >
            Retry PDF
          </Button>
        </div>
      )}

      {isLoadingPdf && !pdfUrl && (
        <div className="rounded-xl border border-border bg-section-bg/50 p-8 text-center text-muted-foreground">
          Generating PDF...
        </div>
      )}

      {pdfUrl && !pdfError && (
        <div className="rounded-xl border border-border bg-section-bg/50 p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold">Implementation Plan</h3>
              <p className="text-sm text-muted-foreground">
                {approvedPlan?.company}
              </p>
            </div>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>

          <iframe
            src={pdfUrl}
            className="w-full h-[600px] border rounded"
            title="Implementation Plan"
          />
        </div>
      )}

      <ImplementationPackages />
    </div>
  );

  return approvedPlan ? mainContent : noPlanContent;
}


