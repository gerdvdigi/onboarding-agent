// Configuración del backend API
// Por defecto usa el backend NestJS en localhost:3001
// Puedes cambiar esto con la variable de entorno NEXT_PUBLIC_API_URL

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const API_ENDPOINTS = {
  chat: `${API_BASE_URL}/chat`,
  generatePdf: `${API_BASE_URL}/generate-pdf`,
} as const;
