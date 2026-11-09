// The session token lives in localStorage. Storage can be blocked (private mode), so every access is guarded.

const TOKEN_KEY = "ndvi.session";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Without storage the user stays signed in only until the page reloads.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to remove.
  }
}

/** The login page URL that comes back to the current page after sign-in. */
export function loginUrl(): string {
  return `/login?next=${encodeURIComponent(window.location.pathname)}`;
}

/** Only same-site paths are allowed after login, so a crafted link cannot send the user elsewhere. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/monitoring";
}
