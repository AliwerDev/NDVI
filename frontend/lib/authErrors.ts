import { ApiError } from "@/lib/api";

export type AuthAction = "login" | "register";

/** User-facing text for an error from an /auth/* call. */
export function authErrorText(err: unknown, action: AuthAction): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Login yoki parol notoʻgʻri.";
    if (err.status === 409) return "Bu login band. Boshqasini tanlang.";
    if (err.status === 422) return "Login 3–32 belgi: kichik lotin harflari, raqam, «_» yoki «.». Parol kamida 8 belgi.";
    if (err.status === 503) return "Telegram bot hozir ishlamayapti. Login va parol bilan kiring.";
  }
  if (err instanceof TypeError) return "Server bilan aloqa yoʻq. Internetni tekshirib, qayta urinib koʻring.";
  return action === "register" ? "Roʻyxatdan oʻtib boʻlmadi. Qayta urinib koʻring." : "Kirib boʻlmadi. Qayta urinib koʻring.";
}
