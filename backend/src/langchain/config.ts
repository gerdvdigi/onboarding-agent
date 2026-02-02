export const langchainConfig = {
  model: {
    name: 'gpt-4o-mini', // Usar gpt-4o-mini para costos, cambiar a gpt-4o para mejor calidad
    temperature: 0.1,
    streaming: true,
  },
  agent: {
    maxIterations: 15,
    interruptBefore: ['generate_plan_draft'], // Pausa antes de generar plan
  },
};

// Variable de entorno para API key
export function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY no está configurada. Por favor, configura la variable de entorno.',
    );
  }
  return key;
}
