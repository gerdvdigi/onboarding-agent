/**
 * Returns the API base URL for backend requests.
 * Falls back to http://localhost:3001 when NEXT_PUBLIC_API_URL is not set.
 * Trims trailing slashes to avoid double slashes in paths.
 */
export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001";
  return url.replace(/\/$/, "");
}
