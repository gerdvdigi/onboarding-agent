"use client";

import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import { getApiBaseUrl } from "@/lib/config/api";
import { Download, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export function FinalizationStep() {
  const { approvedPlan, approvedPlanFullText, userInfo } = useOnboardingStore();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  useEffect(() => {
    if (approvedPlan) {
      generatePDF();
    }
  }, [approvedPlan]);

  const generatePDF = async () => {
    if (!approvedPlan || !userInfo) return;
    setPdfError(null);
    setIsLoadingPdf(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/generate-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan: approvedPlan,
          userInfo,
          fullPlanText: approvedPlanFullText ?? undefined,
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

  if (!approvedPlan) {
    return (
      <div className="text-center py-12">
        <p>No approved plan. Please complete the previous steps.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold">Plan Approved!</h2>
        <p className="text-muted-foreground">
          Your implementation plan has been generated successfully.
        </p>
      </div>

      {pdfError && (
        <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
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
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Generating PDF...
        </div>
      )}

      {pdfUrl && !pdfError && (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-semibold">Implementation Plan</h3>
              <p className="text-sm text-muted-foreground">
                {approvedPlan.company}
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
}

function ImplementationPackages() {
  const packages = [
    {
      name: "Basic Package",
      description: "Initial setup and basic training",
      price: "$2,500",
      features: [
        "Initial CRM configuration",
        "Basic data migration",
        "4-hour training",
        "1 month support",
      ],
    },
    {
      name: "Standard Package",
      description: "Full implementation with automations",
      price: "$5,000",
      features: [
        "Everything in the basic package",
        "Marketing Hub configuration",
        "Custom automations",
        "8-hour training",
        "3 months support",
      ],
    },
    {
      name: "Premium Package",
      description: "Full implementation with integrations",
      price: "$8,500",
      features: [
        "Everything in the standard package",
        "Custom integrations",
        "Sales Hub configuration",
        "16-hour training",
        "6 months support",
        "Strategic consulting",
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Implementation Packages</h3>
      <div className="grid md:grid-cols-3 gap-4">
        {packages.map((pkg, idx) => (
          <div
            key={idx}
            className="border rounded-lg p-6 space-y-4 hover:shadow-lg transition-shadow"
          >
            <div>
              <h4 className="font-semibold text-lg">{pkg.name}</h4>
              <p className="text-sm text-muted-foreground">{pkg.description}</p>
            </div>
            <div className="text-2xl font-bold">{pkg.price}</div>
            <ul className="space-y-2">
              {pkg.features.map((feature, fIdx) => (
                <li key={fIdx} className="flex items-start">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full" variant={idx === 1 ? "default" : "outline"}>
              Select
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
