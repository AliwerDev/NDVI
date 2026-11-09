"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { AlertIcon, SendIcon, SpinnerIcon } from "@/components/icons";
import LogoMark from "@/components/Logo";
import { api, ApiError, type AuthResult } from "@/lib/api";
import { clearToken, getToken, safeNextPath, setToken } from "@/lib/auth";

import "./login.css";

type Mode = "login" | "register";

const POLL_INTERVAL_MS = 2000;

function errorText(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Login yoki parol notoʻgʻri.";
    if (err.status === 409) return "Bu login band. Boshqasini tanlang.";
    if (err.status === 422) return "Login 3–32 belgi: kichik lotin harflari, raqam, «_» yoki «.». Parol kamida 8 belgi.";
    if (err.status === 503) return "Telegram bot hozir ishlamayapti. Login va parol bilan kiring.";
  }
  if (err instanceof TypeError) return "Server bilan aloqa yoʻq. Internetni tekshirib, qayta urinib koʻring.";
  return mode === "register" ? "Roʻyxatdan oʻtib boʻlmadi. Qayta urinib koʻring." : "Kirib boʻlmadi. Qayta urinib koʻring.";
}

function goNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.replace(safeNextPath(next));
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Telegram login: the t.me link and the poll timer while the browser waits for the bot.
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Already signed in: go on. A stale token is dropped, and the form stays.
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(goNext)
      .catch(() => clearToken());
  }, []);

  const finish = (result: AuthResult) => {
    setToken(result.token);
    goNext();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "register" && password !== password2) {
      setError("Parollar bir xil emas.");
      return;
    }
    setBusy(true);
    try {
      finish(mode === "register" ? await api.register(username, password) : await api.login(username, password));
    } catch (err) {
      setError(errorText(err, mode));
      setBusy(false);
    }
  };

  const startTelegram = async () => {
    setError(null);
    stopPolling();
    // Open the tab now, inside the click. A tab opened after an await is often blocked as a popup.
    const tab = window.open("", "_blank");
    try {
      const start = await api.telegramLoginStart();
      setTelegramUrl(start.url);
      if (tab) {
        tab.opener = null;
        tab.location.href = start.url;
      }
      pollRef.current = setInterval(async () => {
        try {
          const poll = await api.telegramLoginPoll(start.poll_token);
          if (poll.status === "confirmed") {
            stopPolling();
            finish(poll);
          }
        } catch (err) {
          stopPolling();
          setTelegramUrl(null);
          setError(
            err instanceof ApiError && err.status === 410
              ? "Kutish vaqti tugadi. «Telegram orqali kirish» tugmasini qayta bosing."
              : errorText(err, "login"),
          );
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      tab?.close();
      setError(errorText(err, "login"));
    }
  };

  const cancelTelegram = () => {
    stopPolling();
    setTelegramUrl(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="auth">
      <Link href="/" className="auth-logo">
        <LogoMark size={40} />
        <span>NDVI monitoring</span>
      </Link>

      <main className="auth-card">
        <div className="auth-head">
          <h1>{mode === "login" ? "Xush kelibsiz" : "Hisob yaratish"}</h1>
          <p>
            {mode === "login"
              ? "Dalalaringizni koʻrish uchun hisobingizga kiring."
              : "Login va parol tanlang. Keyin dalangizni xaritada chizasiz."}
          </p>
        </div>

        <div role="radiogroup" aria-label="Kirish usuli" className="segmented">
          <button type="button" role="radio" aria-checked={mode === "login"} onClick={() => switchMode("login")}>
            Kirish
          </button>
          <button type="button" role="radio" aria-checked={mode === "register"} onClick={() => switchMode("register")}>
            Roʻyxatdan oʻtish
          </button>
        </div>

        {telegramUrl ? (
          <div className="auth-telegram-wait" role="status">
            <span className="auth-telegram-icon">
              <SpinnerIcon size={22} className="spin" />
            </span>
            <p>
              Telegram ochildi. Botda <strong>«Start»</strong> tugmasini bosing, sahifa oʻzi kiradi.
            </p>
            <a className="btn btn-telegram" href={telegramUrl} target="_blank" rel="noopener noreferrer">
              <SendIcon size={16} />
              Telegramni qayta ochish
            </a>
            <button type="button" className="btn btn-muted" onClick={cancelTelegram}>
              Bekor qilish
            </button>
          </div>
        ) : (
          <>
            <form className="auth-form" onSubmit={submit}>
              <div className="input-group">
                <label htmlFor="username" className="label">
                  Login
                </label>
                <input
                  id="username"
                  className="input"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="password" className="label">
                  Parol
                </label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === "register" ? 8 : undefined}
                  required
                />
              </div>
              {mode === "register" && (
                <div className="input-group">
                  <label htmlFor="password2" className="label">
                    Parolni takrorlang
                  </label>
                  <input
                    id="password2"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    required
                  />
                  <span className="auth-hint">Kamida 8 belgi.</span>
                </div>
              )}

              {error && (
                <p className="auth-error" role="alert">
                  <AlertIcon size={16} />
                  <span>{error}</span>
                </p>
              )}

              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy && <SpinnerIcon size={16} className="spin" />}
                {mode === "login" ? "Kirish" : "Roʻyxatdan oʻtish"}
              </button>
            </form>

            <div className="auth-divider">
              <span>yoki</span>
            </div>

            <button type="button" className="btn btn-telegram" onClick={startTelegram} disabled={busy}>
              <SendIcon size={16} />
              Telegram orqali kirish
            </button>
          </>
        )}
      </main>

      <Link href="/" className="auth-back">
        NDVI nima? Bosh sahifaga qaytish
      </Link>
    </div>
  );
}
