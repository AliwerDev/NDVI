"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import AuthShell from "@/components/AuthShell";
import { AlertIcon, CheckIcon, SendIcon, SpinnerIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { authPath, clearToken, currentNext, getToken, goNext, setToken } from "@/lib/auth";
import { authErrorText } from "@/lib/authErrors";

// Same rules as RegisterRequest in app/schemas/auth.py. Upper case is turned into lower case there.
const USERNAME_RE = /^[a-z0-9_.]{3,32}$/;
const PASSWORD_MIN = 8;

export default function RegisterPage() {
  const [next, setNext] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNext(currentNext());
    if (!getToken()) return;
    api
      .me()
      .then(goNext)
      .catch(() => clearToken());
  }, []);

  const usernameOk = USERNAME_RE.test(username.trim().toLowerCase());
  const lengthOk = password.length >= PASSWORD_MIN;
  const mismatch = password2.length > 0 && password2 !== password;
  const canSubmit = usernameOk && lengthOk && password2 === password && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.register(username, password);
      setToken(result.token);
      window.location.replace(authPath("/welcome", next));
    } catch (err) {
      setError(authErrorText(err, "register"));
      setBusy(false);
    }
  };

  return (
    <AuthShell titleId="reg-title">
      <div className="auth-head">
        <h1 id="reg-title">Roʻyxatdan oʻtish</h1>
        <p>Login va parol bilan yangi hisob yarating.</p>
      </div>

      <form className="auth-form" onSubmit={submit} noValidate>
        {error && (
          <p className="auth-error" role="alert">
            <AlertIcon size={18} />
            <span>{error}</span>
          </p>
        )}

        <div className="input-group">
          <label htmlFor="reg-login" className="label">
            Login
          </label>
          <input
            id="reg-login"
            className="input"
            placeholder="Foydalanuvchi nomi"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
            aria-describedby="reg-login-hint"
            required
          />
          <span id="reg-login-hint" className={`auth-hint${usernameOk ? " ok" : ""}`}>
            {usernameOk && <CheckIcon size={14} />}
            3–32 belgi: kichik lotin harflari, raqam, «_» yoki «.»
          </span>
        </div>

        <div className="input-group">
          <label htmlFor="reg-pw" className="label">
            Parol
          </label>
          <input
            id="reg-pw"
            type="password"
            className="input"
            placeholder="Parol"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            aria-describedby="reg-pw-hint"
            required
          />
          <span id="reg-pw-hint" className={`auth-hint${lengthOk ? " ok" : ""}`}>
            {lengthOk && <CheckIcon size={14} />}
            Kamida {PASSWORD_MIN} ta belgi
          </span>
        </div>

        <div className="input-group">
          <label htmlFor="reg-pw2" className="label">
            Parolni takrorlang
          </label>
          <input
            id="reg-pw2"
            type="password"
            className={`input${mismatch ? " invalid" : ""}`}
            placeholder="Parolni takrorlang"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => {
              setPassword2(e.target.value);
              setError(null);
            }}
            aria-invalid={mismatch}
            aria-describedby={mismatch ? "reg-pw2-err" : undefined}
            required
          />
          {mismatch && (
            <span id="reg-pw2-err" className="auth-field-error">
              <AlertIcon size={14} />
              Parollar mos kelmadi.
            </span>
          )}
        </div>

        <button type="submit" className="btn btn-lg btn-primary" disabled={!canSubmit}>
          {busy && <SpinnerIcon size={16} className="spin" />}
          {busy ? "Kuting…" : "Roʻyxatdan oʻtish"}
        </button>
      </form>

      <div className="auth-divider">
        <span>yoki</span>
      </div>

      <Link href={authPath("/login", next)} className="btn btn-telegram-outline">
        <SendIcon size={16} />
        Telegram orqali davom etish
      </Link>

      <p className="auth-footer">
        Hisobingiz bormi? <Link href={authPath("/login?tab=password", next)}>Kirish</Link>
      </p>
    </AuthShell>
  );
}
