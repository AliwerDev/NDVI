"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ArrowRightIcon, BarsIcon, SendIcon, SettingsIcon } from "@/components/icons";
import { AccountSkeleton } from "@/components/Skeletons";
import { api, type User } from "@/lib/api";

// The signed-in user with a link to the settings page. Admins also get a link to the admin panel.
export default function AccountCard() {
  // undefined: the request has not ended yet.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    // A 401 here sends the user to the login page (see lib/api.ts).
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return <AccountSkeleton />;
  if (user === null) return null;

  return (
    <>
      <Link href="/settings" className="account" aria-label={`Sozlamalar: ${user.display_name}`}>
        <span className="account-avatar" aria-hidden="true">
          {user.display_name.charAt(0).toUpperCase()}
        </span>
        <span className="account-name">
          <span>{user.display_name}</span>
          <span className={user.telegram_linked ? "account-tg" : "account-tg off"}>
            <SendIcon size={12} />
            {user.telegram_linked
              ? user.telegram_username
                ? `@${user.telegram_username}`
                : "Telegram ulangan"
              : "Telegram ulanmagan"}
          </span>
        </span>
        <span className="account-gear" aria-hidden="true">
          <SettingsIcon size={18} />
        </span>
      </Link>
      {user.is_admin && (
        <Link href="/admin" className="admin-link">
          <BarsIcon size={18} />
          <span>Admin panel</span>
          <ArrowRightIcon size={16} />
        </Link>
      )}
    </>
  );
}
