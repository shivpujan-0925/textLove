/**
 * Centralized API and WebSocket URL resolver for textLove.
 * Supports cross-origin production deployments (e.g. Vercel Frontend + Render Backend)
 * and local development with Vite proxy.
 */

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  ''
)
  .replace(/\/api\/v1\/?$/, '')
  .replace(/\/+$/, '');

/**
 * Returns full URL for API endpoints.
 * In development without VITE_API_URL, returns relative path (handled by Vite proxy).
 * In production with VITE_API_URL, returns https://backend-domain.com/api/v1/...
 */
export function apiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanEndpoint}` : cleanEndpoint;
}

/**
 * WebSocket base URL for Socket.IO.
 * Empty/undefined connects to window.location.origin.
 */
export const SOCKET_URL: string | undefined = API_BASE_URL || undefined;
