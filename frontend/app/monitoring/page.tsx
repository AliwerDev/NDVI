"use client";

import dynamic from "next/dynamic";

// MapLibre needs the browser window, so the app renders only on the client.
const FieldMonitor = dynamic(() => import("@/components/FieldMonitor"), { ssr: false });

export default function MonitoringPage() {
  return <FieldMonitor />;
}
