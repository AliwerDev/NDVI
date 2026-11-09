"use client";

import { useEffect, useState } from "react";

import AuthShell from "@/components/AuthShell";
import { ArrowRightIcon, CheckIcon, SpinnerIcon } from "@/components/icons";
import { api, type User } from "@/lib/api";
import { currentNext, getToken, loginUrl, safeNextPath } from "@/lib/auth";

export default function WelcomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [nextPath, setNextPath] = useState("/monitoring");

  useEffect(() => {
    if (!getToken()) {
      window.location.replace(loginUrl());
      return;
    }
    setNextPath(safeNextPath(currentNext()));
    // A 401 here sends the user to the login page (see request() in lib/api.ts).
    api.me().then(setUser, () => undefined);
  }, []);

  return (
    <AuthShell titleId="wel-title">
      {user ? (
        <>
          <div className="auth-head">
            <h1 id="wel-title">Xush kelibsiz, {user.display_name}</h1>
            <p>Hisobingiz yaratildi. Endi maydonlaringizni qoʻshishingiz mumkin.</p>
          </div>

          <div className="welcome-user">
            <span className="welcome-avatar" aria-hidden="true">
              {user.display_name.charAt(0)}
            </span>
            <div className="welcome-name">
              <span>{user.display_name}</span>
              {user.username && <span>@{user.username}</span>}
            </div>
            {user.telegram_linked ? (
              <span className="welcome-chip on">
                <CheckIcon size={12} />
                Telegram ulandi
              </span>
            ) : (
              <span className="welcome-chip">Telegram ulanmagan</span>
            )}
          </div>

          <ol className="welcome-steps">
            <li>
              <span className="welcome-step-num" aria-hidden="true">
                1
              </span>
              <div>
                <strong>Maydon chizing</strong>
                <span>Xaritada dala burchaklarini bosing.</span>
              </div>
            </li>
            <li>
              <span className="welcome-step-num" aria-hidden="true">
                2
              </span>
              <div>
                <strong>NDVI hisoblang</strong>
                <span>Soʻnggi 30 kunlik sunʼiy yoʻldosh tasvirlari asosida.</span>
              </div>
            </li>
            <li>
              <span className="welcome-step-num" aria-hidden="true">
                3
              </span>
              <div>
                <strong>Ogohlantirishlarni oling</strong>
                <span>
                  {user.telegram_linked
                    ? "Ogohlantirishlar ulangan Telegram hisobingizga keladi."
                    : "Xarita sahifasida «Telegramni ulash» tugmasini bosing."}
                </span>
              </div>
            </li>
          </ol>

          <a href={nextPath} className="btn btn-lg btn-primary auth-link-btn">
            Xaritaga oʻtish
            <ArrowRightIcon size={16} />
          </a>
        </>
      ) : (
        <div className="auth-loading" role="status">
          <h1 id="wel-title" className="sr-only">
            Xush kelibsiz
          </h1>
          <SpinnerIcon size={24} className="spin" />
        </div>
      )}
    </AuthShell>
  );
}
