import { streamOnboardingAgent } from "@/lib/langchain/agent/graph";
import { HumanMessage, AIMessage, AIMessageChunk } from "@langchain/core/messages";
import type { UserInfo, OnboardingContext } from "@/lib/langchain/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, userInfo, context } = await req.json();

    if (!userInfo) {
      return new Response(
        JSON.stringify({ error: "UserInfo es requerido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Convertir mensajes al formato de LangChain
    // IMPORTANTE: Incluir TODOS los mensajes del historial para que el agente tenga contexto completo
    const langchainMessages = messages.map((msg: { role: string; content: string }) => {
      if (msg.role === "user") {
        return new HumanMessage(msg.content);
      }
      return new AIMessage(msg.content);
    });

    // Debug: Log detallado del historial completo
    console.log(`[API] ========================================`);
    console.log(`[API] Procesando ${langchainMessages.length} mensajes del historial`);
    console.log(`[API] Historial completo:`);
    langchainMessages.forEach((msg, idx) => {
      const role = msg instanceof HumanMessage ? "USER" : "ASSISTANT";
      const content = typeof msg.content === "string" 
        ? msg.content.substring(0, 100) + (msg.content.length > 100 ? "..." : "")
        : JSON.stringify(msg.content).substring(0, 100);
      console.log(`[API]   ${idx + 1}. [${role}]: ${content}`);
    });
    console.log(`[API] ========================================`);

    // Crear stream con streaming real
    const encoder = new TextEncoder();
    let lastMessageCount = langchainMessages.length;
    let lastAIMessageContent = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Usar streaming real del agente
          const stream = streamOnboardingAgent(
            langchainMessages,
            userInfo as UserInfo
          );

          let finalMessages: any[] = [];

          for await (const chunk of stream) {
            // El chunk contiene el estado completo en cada paso
            const currentMessages = chunk?.messages || [];
            finalMessages = currentMessages;
            
            // Buscar el último mensaje del asistente
            const lastAIMessage = [...currentMessages]
              .reverse()
              .find((msg: any) => 
                msg instanceof AIMessage || 
                msg instanceof AIMessageChunk ||
                msg.constructor.name === "AIMessage" || 
                msg.constructor.name === "AIMessageChunk"
              );

            if (lastAIMessage) {
              let content = "";
              
              // Manejar diferentes tipos de contenido
              if (typeof lastAIMessage.content === "string") {
                content = lastAIMessage.content;
              } else if (Array.isArray(lastAIMessage.content)) {
                // Si es un array, puede contener texto y tool calls
                content = lastAIMessage.content
                  .map((c: any) => {
                    if (typeof c === "string") return c;
                    if (c && typeof c === "object" && c.type === "text") return c.text;
                    return "";
                  })
                  .filter(Boolean)
                  .join("");
              } else if (lastAIMessage.content) {
                content = JSON.stringify(lastAIMessage.content);
              }

              // Enviar solo el contenido nuevo (diferencia incremental)
              if (content && content.length > lastAIMessageContent.length) {
                const newContent = content.slice(lastAIMessageContent.length);
                lastAIMessageContent = content;
                
                // Enviar el nuevo contenido al frontend
                if (newContent) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "message", content: newContent })}\n\n`
                    )
                  );
                }
              }
            }
          }

          // Verificar si hay un plan generado en el último mensaje
          const lastMessage = finalMessages.length > 0 
            ? finalMessages[finalMessages.length - 1] 
            : null;

          if (lastMessage && typeof lastMessage.content === "string") {
            const content = lastMessage.content;
            // Detectar si el mensaje contiene un plan
            if (content.includes("plan de implementación") || 
                content.includes("OBJETIVOS:") || 
                content.includes("MÓDULOS RECOMENDADOS:")) {
              // El plan está en el mensaje, el frontend lo procesará
            }
          }

          // Finalización
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "end" })}\n\n`)
          );
          controller.close();
        } catch (error) {
          console.error("Error en stream:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "Error desconocido",
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error en API route:", error);
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
