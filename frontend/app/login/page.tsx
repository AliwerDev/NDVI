"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import AuthShell from "@/components/AuthShell";
import { AlertIcon, EyeIcon, EyeOffIcon, LockIcon, SendIcon, SpinnerIcon } from "@/components/icons";
import { api, ApiError, type AuthResult } from "@/lib/api";
import { authPath, clearToken, currentNext, getToken, goNext, setToken } from "@/lib/auth";
import { authErrorText } from "@/lib/authErrors";

type Tab = "telegram" | "password";

const TABS: Tab[] = ["telegram", "password"];
const POLL_INTERVAL_MS = 2000;

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("telegram");
  const [next, setNext] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ telegram: null, password: null });

  // Telegram login: the t.me link and the poll timer while the browser waits for the bot.
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // The URL is read after mount: the server render has no window.
  useEffect(() => {
    setNext(currentNext());
    if (new URLSearchParams(window.location.search).get("tab") === "password") setTab("password");
  }, []);

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
    setBusy(true);
    try {
      finish(await api.login(username, password));
    } catch (err) {
      setError(authErrorText(err, "login"));
      setBusy(false);
    }
  };

  const startTelegram = async () => {
    setError(null);
    stopPolling();
    // Open the tab now, inside the click. A tab opened after an await is often blocked as a popup.
    const popup = window.open("", "_blank");
    try {
      const start = await api.telegramLoginStart();
      setTelegramUrl(start.url);
      if (popup) {
        popup.opener = null;
        popup.location.href = start.url;
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
              : authErrorText(err, "login"),
          );
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      popup?.close();
      setError(authErrorText(err, "login"));
    }
  };

  const cancelTelegram = () => {
    stopPolling();
    setTelegramUrl(null);
  };

  const selectTab = (nextTab: Tab) => {
    if (nextTab === tab) return;
    cancelTelegram();
    setTab(nextTab);
    setError(null);
  };

  // Arrow keys move between the tabs, as in the WAI-ARIA tabs pattern.
  const onTabKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const other = TABS[(TABS.indexOf(tab) + 1) % TABS.length];
    selectTab(other);
    tabRefs.current[other]?.focus();
  };

  const errorBlock = error && (
    <p className="auth-error" role="alert">
      <AlertIcon size={18} />
      <span>{error}</span>
    </p>
  );

  return (
    <AuthShell titleId="auth-title">
      <div className="auth-head">
        <h1 id="auth-title">Kirish</h1>
        <p>Kirish usulini tanlang.</p>
      </div>

      <div role="tablist" aria-label="Kirish usuli" className="auth-tabs" onKeyDown={onTabKey}>
        <button
          ref={(el) => {
            tabRefs.current.telegram = el;
          }}
          type="button"
          role="tab"
          id="tab-telegram"
          aria-selected={tab === "telegram"}
          aria-controls="panel-telegram"
          tabIndex={tab === "telegram" ? 0 : -1}
          onClick={() => selectTab("telegram")}
        >
          <SendIcon size={16} className="tab-icon-telegram" />
          Telegram
        </button>
        <button
          ref={(el) => {
            tabRefs.current.password = el;
          }}
          type="button"
          role="tab"
          id="tab-password"
          aria-selected={tab === "password"}
          aria-controls="panel-password"
          tabIndex={tab === "password" ? 0 : -1}
          onClick={() => selectTab("password")}
        >
          <LockIcon size={16} className="tab-icon-lock" />
          Login va parol
        </button>
      </div>

      {tab === "telegram" ? (
        <div role="tabpanel" id="panel-telegram" aria-labelledby="tab-telegram" className="auth-panel">
          {telegramUrl ? (
            <>
              <div className="auth-status" role="status">
                <SpinnerIcon size={20} className="spin" />
                <p>
                  Telegram ilovasida kirishni tasdiqlang: botda <strong>«Start»</strong> tugmasini bosing. Sahifa oʻzi
                  kiradi.
                </p>
              </div>
              <a
                className="btn btn-lg btn-telegram auth-link-btn"
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SendIcon size={18} />
                Telegramni qayta ochish
              </a>
              <button type="button" className="btn btn-outline" onClick={cancelTelegram}>
                Bekor qilish
              </button>
            </>
          ) : (
            <>
              <p>Telegram hisobingiz orqali bir bosishda kiring. Ogohlantirishlar ham shu hisobga keladi.</p>
              {errorBlock}
              <button type="button" className="btn btn-lg btn-telegram" onClick={startTelegram}>
                <SendIcon size={18} />
                Telegram orqali kirish
              </button>
            </>
          )}
        </div>
      ) : (
        <form
          role="tabpanel"
          id="panel-password"
          aria-labelledby="tab-password"
          className="auth-form"
          onSubmit={submit}
        >
          {errorBlock}
          <div className="input-group">
            <label htmlFor="username" className="label">
              Login
            </label>
            <input
              id="username"
              className={`input${error ? " invalid" : ""}`}
              placeholder="Foydalanuvchi nomi"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
              }}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="password" className="label">
              Parol
            </label>
            <div className={`auth-password${error ? " invalid" : ""}`}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Parol"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Parolni yashirish" : "Parolni koʻrsatish"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-lg btn-primary" disabled={busy}>
            {busy && <SpinnerIcon size={16} className="spin" />}
            {busy ? "Kuting…" : "Kirish"}
          </button>
        </form>
      )}

      <p className="auth-footer">
        Hisobingiz yoʻqmi? <Link href={authPath("/register", next)}>Roʻyxatdan oʻting</Link>
      </p>
    </AuthShell>
  );
}
