const DEFAULT_API_BASE = "http://localhost:3001";

/** Backend API origin (no trailing slash). Set VITE_API_URL in production builds. */
export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE;
}

export const API_BASE = getApiBase();
