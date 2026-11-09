"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { getToken, loginUrl } from "@/lib/auth";

// MapLibre needs the browser window, so the app renders only on the client.
const FieldMonitor = dynamic(() => import("@/components/FieldMonitor"), { ssr: false });

export default function MonitoringPage() {
  const [signedIn, setSignedIn] = useState(false);

  // Without a token, go to the login page. An invalid token is caught by the first API call (401).
  useEffect(() => {
    if (getToken()) setSignedIn(true);
    else window.location.replace(loginUrl());
  }, []);

  return signedIn ? <FieldMonitor /> : null;
}
