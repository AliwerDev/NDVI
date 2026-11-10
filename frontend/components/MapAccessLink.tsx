"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { ArrowRightIcon } from "@/components/icons";
import { getToken } from "@/lib/auth";

// Sign-in and sign-out in another tab change localStorage and fire "storage" here.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * One button for the map: "Kirish" for guests, "Xaritani ochish" for signed-in users.
 * The server render shows the guest button, because the token lives only in the browser.
 * After login the user lands on /monitoring (the default "next" path).
 */
export default function MapAccessLink({ className, iconSize = 18 }: { className: string; iconSize?: number }) {
  const signedIn = useSyncExternalStore(subscribe, () => getToken() !== null, () => false);
  return (
    <Link href={signedIn ? "/monitoring" : "/login"} className={className}>
      {signedIn ? "Xaritani ochish" : "Kirish"}
      <ArrowRightIcon size={iconSize} />
    </Link>
  );
}
