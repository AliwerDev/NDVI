"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  LogoutIcon,
  PencilIcon,
  SendIcon,
  SpinnerIcon,
} from "@/components/icons";
import LogoMark from "@/components/Logo";
import { api, type FieldFeature, type User } from "@/lib/api";
import { clearToken, getToken, loginUrl } from "@/lib/auth";

import "./settings.css";

const NAME_MAX = 64;
const FIELD_NAME_MAX = 200;

// While the user links Telegram: check the account every 3 s, for as long as the code lives (10 min).
const TELEGRAM_CHECK_MS = 3_000;
const TELEGRAM_CODE_MS = 10 * 60_000;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="settings-error" role="alert">
      <AlertIcon size={16} />
      <span>{text}</span>
    </p>
  );
}

function signInMethod(user: User): string {
  if (user.has_password && user.telegram_linked) return "Login va parol, Telegram";
  return user.has_password ? "Login va parol" : "Telegram";
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [fields, setFields] = useState<FieldFeature[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace(loginUrl());
      return;
    }
    // A 401 sends the user to the login page (see request() in lib/api.ts).
    Promise.all([api.me(), api.listFields()])
      .then(([me, list]) => {
        setUser(me);
        setFields(list);
      })
      .catch((err) => setLoadError(errorText(err)));
  }, []);

  return (
    <div className="settings">
      <header className="settings-top">
        <div className="settings-top-inner">
          <Link href="/" className="settings-brand">
            <LogoMark size={32} />
            <span>NDVI monitoring</span>
          </Link>
          <Link href="/monitoring" className="btn btn-outline settings-back">
            <ArrowLeftIcon size={16} />
            Xaritaga qaytish
          </Link>
        </div>
      </header>

      <main className="settings-main">
        <div className="settings-head">
          <h1>Sozlamalar</h1>
          <p>Hisobingiz, Telegram va maydonlaringiz.</p>
        </div>

        <ErrorLine text={loadError} />

        {user ? (
          <>
            <ProfileCard user={user} onSaved={setUser} />
            <TelegramCard user={user} onChanged={setUser} />
            <FieldsCard fields={fields} onRenamed={(f) => setFields((list) => list.map((x) => (x.id === f.id ? f : x)))} />
            <LogoutCard />
          </>
        ) : (
          !loadError && (
            <div className="settings-loading" role="status" aria-label="Yuklanmoqda">
              <SpinnerIcon size={24} className="spin" />
            </div>
          )
        )}
      </main>
    </div>
  );
}

function ProfileCard({ user, onSaved }: { user: User; onSaved: (user: User) => void }) {
  const [name, setName] = useState(user.display_name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const dirty = trimmed.length > 0 && trimmed !== user.display_name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateDisplayName(trimmed);
      onSaved(updated);
      setName(updated.display_name);
      setSaved(true);
    } catch (err) {
      setError(`Ismni saqlab boʻlmadi. ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="set-profile">
      <h2 id="set-profile">Profil</h2>

      <div className="settings-identity">
        <span className="settings-avatar" aria-hidden="true">
          {user.display_name.charAt(0)}
        </span>
        <div>
          <strong>{user.display_name}</strong>
          <span>{user.has_password ? "Login va parol bilan kiradi" : "Telegram orqali kiradi"}</span>
        </div>
      </div>

      <form className="input-group" onSubmit={submit}>
        <label htmlFor="set-name" className="label">
          Koʻrinadigan ism
        </label>
        <div className="settings-inline">
          <input
            id="set-name"
            className="input"
            autoComplete="name"
            maxLength={NAME_MAX}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            aria-describedby="set-name-hint"
          />
          <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>
            {busy && <SpinnerIcon size={16} className="spin" />}
            Saqlash
          </button>
        </div>
        {saved ? (
          <span className="settings-saved" role="status">
            <CheckIcon size={14} />
            Saqlandi
          </span>
        ) : (
          <span id="set-name-hint" className="settings-hint">
            Chap paneldagi hisob qatorida koʻrinadi. Login oʻzgarmaydi.
          </span>
        )}
      </form>

      <ErrorLine text={error} />

      <dl className="settings-facts">
        {user.username && (
          <>
            <dt>Login</dt>
            <dd>{user.username}</dd>
          </>
        )}
        <dt>Kirish usuli</dt>
        <dd>{signInMethod(user)}</dd>
      </dl>
    </section>
  );
}

function TelegramCard({ user, onChanged }: { user: User; onChanged: (user: User) => void }) {
  // The "Telegramni ulash" button shows only when the bot runs.
  const [botAvailable, setBotAvailable] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // The link, when the browser blocked the new tab.
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .telegramBot()
      .then((username) => setBotAvailable(username !== null))
      .catch(() => undefined);
  }, []);

  // After "Telegramni ulash": the user taps "Start" in Telegram, then comes back. Check the account
  // when the tab gets focus and every few seconds, until the link shows or the code expires.
  useEffect(() => {
    if (!waiting) return;
    const refresh = () =>
      api
        .me()
        .then((me) => {
          onChanged(me);
          if (me.telegram_linked) {
            setWaiting(false);
            setBlockedUrl(null);
          }
        })
        .catch(() => undefined);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, TELEGRAM_CHECK_MS);
    const stop = setTimeout(() => setWaiting(false), TELEGRAM_CODE_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [waiting, onChanged]);

  const link = async () => {
    setError(null);
    setBlockedUrl(null);
    // Open the tab now, inside the click. A tab opened after an await is often blocked as a popup.
    const tab = window.open("", "_blank");
    try {
      const url = await api.telegramLink();
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        setBlockedUrl(url);
      }
      setWaiting(true);
    } catch (err) {
      tab?.close();
      setError(`Telegramni ulab boʻlmadi. ${errorText(err)}`);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.telegramUnlink();
      onChanged(await api.me());
    } catch (err) {
      setError(`Telegramni uzib boʻlmadi. ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="set-tg">
      <div className="settings-section-head">
        <h2 id="set-tg">Telegram</h2>
        <p>Barcha maydonlaringiz boʻyicha NDVI ogohlantirishlari shu hisobga keladi.</p>
      </div>

      {user.telegram_linked ? (
        <div className="settings-telegram">
          <span className="settings-telegram-icon" aria-hidden="true">
            <SendIcon size={18} />
          </span>
          <div className="settings-telegram-text">
            <strong>{user.telegram_username ? `@${user.telegram_username}` : "Telegram hisobi"}</strong>
            <span>
              <CheckIcon size={12} strokeWidth={3} />
              Ulangan
            </span>
          </div>
          {user.has_password && (
            <button type="button" className="btn btn-danger" onClick={unlink} disabled={busy}>
              {busy && <SpinnerIcon size={16} className="spin" />}
              Uzish
            </button>
          )}
        </div>
      ) : (
        <div className="settings-telegram">
          <p>Telegram ulanmagan. Ogohlantirishlar hech qayerga yuborilmaydi.</p>
          {botAvailable && (
            <button type="button" className="btn btn-telegram" onClick={link} disabled={waiting}>
              {waiting ? <SpinnerIcon size={16} className="spin" /> : <SendIcon size={16} />}
              {waiting ? "Telegramda «Start» ni bosing…" : "Telegramni ulash"}
            </button>
          )}
        </div>
      )}

      {user.telegram_linked && !user.has_password && (
        <p className="settings-note">Telegram orqali kirgan hisobni uzib boʻlmaydi: bu kirishning yagona usuli.</p>
      )}
      {!user.telegram_linked && !botAvailable && (
        <p className="settings-note">Telegram bot hozir ishlamayapti. Keyinroq qayta urinib koʻring.</p>
      )}
      {blockedUrl && (
        <a className="telegram-fallback" href={blockedUrl} target="_blank" rel="noopener noreferrer">
          Telegram ochilmadimi? Shu yerni bosing.
        </a>
      )}
      <ErrorLine text={error} />
    </section>
  );
}

function FieldsCard({ fields, onRenamed }: { fields: FieldFeature[]; onRenamed: (field: FieldFeature) => void }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  // After save or cancel, focus goes back to the pencil button of the same row.
  const pencils = useRef(new Map<number, HTMLButtonElement>());
  const [refocusId, setRefocusId] = useState<number | null>(null);

  useEffect(() => {
    if (refocusId === null) return;
    pencils.current.get(refocusId)?.focus();
    setRefocusId(null);
  }, [refocusId]);

  const startEdit = (field: FieldFeature) => {
    setEditingId(field.id);
    setDraft(field.properties.name);
    setError(null);
    setStatus("");
  };

  const stopEdit = (id: number) => {
    setEditingId(null);
    setRefocusId(id);
  };

  const save = async (event: FormEvent, field: FieldFeature) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (name === field.properties.name) {
      stopEdit(field.id);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onRenamed(await api.renameField(field.id, name));
      setStatus(`«${name}» nomi saqlandi.`);
      stopEdit(field.id);
    } catch (err) {
      setError(`Nomni saqlab boʻlmadi. ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="set-fields">
      <div className="settings-row-head">
        <h2 id="set-fields">Maydonlar</h2>
        <span className="badge">{fields.length}</span>
      </div>

      {fields.length === 0 ? (
        <p className="settings-note">Hali maydon yoʻq. Maydonni xaritada chizasiz.</p>
      ) : (
        <ul className="settings-fields">
          {fields.map((field) =>
            field.id === editingId ? (
              <li key={field.id} className="editing">
                <span className="settings-field-id">{field.id}.</span>
                <form
                  className="settings-field-form"
                  onSubmit={(e) => save(e, field)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") stopEdit(field.id);
                  }}
                >
                  <input
                    className="input"
                    aria-label={`${field.id}-maydon nomi`}
                    maxLength={FIELD_NAME_MAX}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
                    {busy && <SpinnerIcon size={16} className="spin" />}
                    Saqlash
                  </button>
                  <button type="button" className="settings-text-btn" onClick={() => stopEdit(field.id)}>
                    Bekor qilish
                  </button>
                </form>
              </li>
            ) : (
              <li key={field.id}>
                <span className="settings-field-id">{field.id}.</span>
                <span className="settings-field-name">{field.properties.name}</span>
                <button
                  ref={(el) => {
                    if (el) pencils.current.set(field.id, el);
                    else pencils.current.delete(field.id);
                  }}
                  type="button"
                  className="settings-icon-btn"
                  aria-label={`«${field.properties.name}» nomini oʻzgartirish`}
                  onClick={() => startEdit(field)}
                >
                  <PencilIcon size={16} />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      <p className="sr-only" role="status">
        {status}
      </p>
      <ErrorLine text={error} />
    </section>
  );
}

function LogoutCard() {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await api.logout();
    } catch {
      // The server is unreachable or the session is already gone. This browser forgets it anyway.
    }
    clearToken();
    window.location.assign("/login");
  };

  return (
    <section className="settings-card settings-exit" aria-labelledby="set-exit">
      <div className="settings-section-head">
        <h2 id="set-exit">Chiqish</h2>
        <p>Shu brauzerdan chiqasiz. Boshqa qurilmalardagi kirishlar saqlanib qoladi.</p>
      </div>
      <button type="button" className="btn btn-danger" onClick={logout} disabled={busy}>
        {busy ? <SpinnerIcon size={16} className="spin" /> : <LogoutIcon size={16} />}
        Chiqish
      </button>
    </section>
  );
}
