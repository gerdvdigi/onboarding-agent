import type { ImplementationPlan, UserInfo } from "@/lib/langchain/agent";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { plan, userInfo }: { plan: ImplementationPlan; userInfo: UserInfo } =
      await req.json();

    if (!plan || !userInfo) {
      return new Response(
        JSON.stringify({ error: "Plan y userInfo son requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generar PDF simple (usando texto plano por ahora, se puede mejorar con react-pdf)
    const pdfContent = generatePDFContent(plan, userInfo);

    // Por ahora retornamos un blob de texto, luego se puede mejorar con react-pdf
    const blob = new Blob([pdfContent], { type: "text/plain" });

    return new Response(blob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="plan-implementacion-${userInfo.company}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error desconocido",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

function generatePDFContent(plan: ImplementationPlan, userInfo: UserInfo): string {
  return `
PLAN DE IMPLEMENTACIÓN HUBSPOT
${"=".repeat(50)}

Empresa: ${plan.company}
Contacto: ${userInfo.name} ${userInfo.lastName}
Email: ${userInfo.email}
Website: ${userInfo.website}

Fecha: ${new Date().toLocaleDateString("es-ES")}

${"=".repeat(50)}

OBJETIVOS
${"-".repeat(50)}
${plan.objectives.map((obj, idx) => `${idx + 1}. ${obj}`).join("\n")}

${"=".repeat(50)}

MÓDULOS RECOMENDADOS
${"-".repeat(50)}
${plan.modules
  .map(
    (mod, idx) =>
      `${idx + 1}. ${mod.name} (Prioridad: ${mod.priority})\n   ${mod.description}`
  )
  .join("\n\n")}

${"=".repeat(50)}

TIMELINE
${"-".repeat(50)}
${plan.timeline}

${"=".repeat(50)}

RECOMENDACIONES
${"-".repeat(50)}
${plan.recommendations.map((rec, idx) => `${idx + 1}. ${rec}`).join("\n")}

${"=".repeat(50)}

Este documento fue generado automáticamente por el sistema de onboarding de HubSpot.
  `.trim();
}
