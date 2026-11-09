import Link from "next/link";
import type { ReactNode } from "react";

import LogoMark from "@/components/Logo";
import { NDVI_STOPS } from "@/lib/ndvi";

import "./auth.css";

const FIRST = NDVI_STOPS[0][0];
const SPAN = NDVI_STOPS[NDVI_STOPS.length - 1][0] - FIRST;
const RAMP = `linear-gradient(to right, ${NDVI_STOPS.map(
  ([value, color]) => `${color} ${(((value - FIRST) / SPAN) * 100).toFixed(2)}%`,
).join(", ")})`;

type Props = {
  /** The id of the card heading, for aria-labelledby. */
  titleId: string;
  children: ReactNode;
};

/** Two columns for the auth pages: the brand panel and the form card. */
export default function AuthShell({ titleId, children }: Props) {
  return (
    <main className="auth">
      <section className="auth-brand" aria-label="NDVI monitoring haqida">
        <Link href="/" className="auth-brand-logo">
          <LogoMark size={40} />
          <span>NDVI monitoring</span>
        </Link>

        <div className="auth-brand-art">
          <LogoMark size={300} />
        </div>

        <div className="auth-brand-text">
          <h2>Dalangiz holatini kosmosdan kuzating.</h2>
          <p>Sentinel-2 tasvirlari asosida har bir maydon uchun NDVI.</p>
          <div className="auth-ramp" aria-hidden="true" style={{ background: RAMP }} />
        </div>
      </section>

      <section className="auth-side" aria-labelledby={titleId}>
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}
