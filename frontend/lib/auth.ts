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

/** The "next" value of the current URL, or null. */
export function currentNext(): string | null {
  return new URLSearchParams(window.location.search).get("next");
}

/** Go to the page that sent the user to the login page. */
export function goNext(): void {
  window.location.replace(safeNextPath(currentNext()));
}

/** An auth page path that keeps the "next" value of the current URL. Use it from client code only. */
export function authPath(path: string, next: string | null = currentNext()): string {
  if (!next) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}next=${encodeURIComponent(next)}`;
}
