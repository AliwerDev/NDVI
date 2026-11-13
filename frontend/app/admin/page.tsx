"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import AdminUsers from "@/components/admin/AdminUsers";
import DailyBars from "@/components/admin/DailyBars";
import { formatAge, formatNumber, formatSeen, formatTotalArea, percent } from "@/components/admin/format";
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  HistoryIcon,
  LockIcon,
  RefreshIcon,
  SpinnerIcon,
} from "@/components/icons";
import LogoMark from "@/components/Logo";
import { type AdminStats, api, ApiError, errorText } from "@/lib/api";
import { getToken, loginUrl } from "@/lib/auth";
import { formatDayMonth } from "@/lib/ndvi";

import "./admin.css";

// Unsent alerts younger than this are only waiting for the next bot run.
const UNSENT_WARN_MINUTES = 15;
// The scheduler updates the weather every day. Older data means it stopped.
const WEATHER_WARN_HOURS = 36;

type Kpi = { label: string; value: string; note: string; alert?: boolean };

function kpis(stats: AdminStats): Kpi[] {
  const alerts = Object.values(stats.alerts_30d).reduce((sum, count) => sum + count, 0);
  const backfillNote = [
    "Ishlayapti",
    stats.backfill_stuck > 0 ? `${stats.backfill_stuck} toʻxtab qolgan` : null,
    stats.backfill_failed_30d > 0 ? `${stats.backfill_failed_30d} xato (30 kun)` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    {
      label: "Foydalanuvchilar",
      value: formatNumber(stats.users_total),
      note: `+${formatNumber(stats.users_new_7d)} oxirgi 7 kunda`,
    },
    {
      label: "Faol (7 kun)",
      value: formatNumber(stats.users_active_7d),
      note: `${percent(stats.users_active_7d, stats.users_total)}% foydalanuvchilar`,
    },
    {
      label: "Telegram ulangan",
      value: formatNumber(stats.users_telegram),
      note: `${percent(stats.users_telegram, stats.users_total)}% foydalanuvchilar`,
    },
    {
      label: "Maydonlar",
      value: formatNumber(stats.fields_total),
      note: `Jami ${formatTotalArea(stats.fields_area_ha)}`,
    },
    {
      label: "Kuzatuvlar",
      value: formatNumber(stats.observations_total),
      note: `+${formatNumber(stats.observations_new_7d)} oxirgi 7 kunda`,
    },
    {
      label: "NDVI hisoblanmagan maydonlar",
      value: formatNumber(stats.fields_without_observations),
      note: "Hali bitta kuzatuv yoʻq",
    },
    {
      label: "Ogohlantirishlar (30 kun)",
      value: formatNumber(alerts),
      note: stats.alerts_unsent > 0 ? `${stats.alerts_unsent} tasi yuborilmagan` : "Hammasi yuborilgan",
      alert: stats.alerts_unsent > 0,
    },
    {
      label: "Fon yuklash",
      value: formatNumber(stats.backfill_running),
      note: backfillNote,
      alert: stats.backfill_stuck > 0 || stats.backfill_failed_30d > 0,
    },
  ];
}

function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="admin-hbars">
      {rows.map((row) => (
        <li key={row.label}>
          <span>{row.label}</span>
          <span className="admin-hbar-track" aria-hidden="true">
            <span className="admin-hbar" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <strong>{formatNumber(row.value)}</strong>
        </li>
      ))}
    </ul>
  );
}

type Status = { level: "ok" | "warn" | "error"; content: ReactNode };

function systemStatus(stats: AdminStats): Status[] {
  const items: Status[] = [];
  const failed = stats.recent_failed_backfills[0];
  if (stats.backfill_failed_30d > 0) {
    items.push({
      level: "error",
      content: (
        <>
          <strong>Xato:</strong> 30 kunda {stats.backfill_failed_30d} ta fon yuklash xato bilan tugadi.
          {failed && (
            <>
              {" "}
              Oxirgisi: «{failed.field_name}»{failed.owner_name ? ` (${failed.owner_name})` : ""}
              {failed.finished_at ? `, ${formatSeen(failed.finished_at).toLowerCase()}` : ""}.
            </>
          )}
        </>
      ),
    });
  }
  if (stats.backfill_stuck > 0) {
    items.push({
      level: "warn",
      content: (
        <>
          <strong>Diqqat:</strong> {stats.backfill_stuck} ta fon yuklash 1 soatdan beri oldinga siljimayapti.
        </>
      ),
    });
  }
  const oldest = stats.alerts_unsent_oldest;
  if (oldest && Date.now() - new Date(oldest).getTime() > UNSENT_WARN_MINUTES * 60_000) {
    items.push({
      level: "warn",
      content: (
        <>
          <strong>Diqqat:</strong> {stats.alerts_unsent} ta ogohlantirish Telegramga yuborilmagan. Eng eskisi{" "}
          {formatAge(oldest)} oldin.
        </>
      ),
    });
  }
  items.push({
    level: "ok",
    content: stats.latest_scene_date
      ? `Oxirgi sunʼiy yoʻldosh surati: ${formatDayMonth(stats.latest_scene_date)}`
      : "Hali kuzatuv yoʻq",
  });
  const weather = stats.weather_fetched_at;
  const weatherOld = !weather || Date.now() - new Date(weather).getTime() > WEATHER_WARN_HOURS * 3_600_000;
  items.push({
    level: weatherOld ? "warn" : "ok",
    content: weather ? `Ob-havo yangilangan: ${formatSeen(weather).toLowerCase()}` : "Ob-havo hali yuklanmagan",
  });
  return items;
}

const STATUS_ICONS = { ok: CheckIcon, warn: HistoryIcon, error: AlertIcon };

function StatsSkeleton() {
  return (
    <div className="admin-skeleton" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="admin-kpis">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="card admin-kpi">
            <span className="sk" style={{ width: "60%", height: 12 }} />
            <span className="sk" style={{ width: "40%", height: 28 }} />
            <span className="sk" style={{ width: "70%", height: 10 }} />
          </div>
        ))}
      </div>
      <div className="admin-charts">
        <div className="card">
          <span className="sk" style={{ width: "40%", height: 12 }} />
          <span className="sk" style={{ height: 170 }} />
        </div>
        <div className="card">
          <span className="sk" style={{ width: "40%", height: 12 }} />
          <span className="sk" style={{ height: 170 }} />
        </div>
      </div>
    </div>
  );
}

function Forbidden() {
  return (
    <div className="admin-forbidden">
      <div className="card">
        <span className="admin-forbidden-icon" aria-hidden="true">
          <LockIcon size={22} />
        </span>
        <h1>Bu sahifa faqat admin uchun</h1>
        <p>Hisobingizda admin huquqi yoʻq.</p>
        <Link href="/monitoring" className="btn btn-primary">
          Xaritaga qaytish
        </Link>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    // A 401 sends the user to the login page (see request() in lib/api.ts).
    api
      .adminStats()
      .then((result) => {
        setStats(result);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(errorText(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace(loginUrl());
      return;
    }
    load();
  }, [load]);

  const refresh = () => {
    load();
    setRefreshKey((key) => key + 1);
  };

  if (forbidden) return <Forbidden />;

  return (
    <div className="admin">
      <header className="admin-top">
        <div className="admin-top-inner">
          <Link href="/monitoring" className="btn btn-outline btn-sm">
            <ArrowLeftIcon size={16} />
            Xarita
          </Link>
          <div className="admin-brand">
            <LogoMark size={36} />
            <h1>Admin panel</h1>
          </div>
          <div className="admin-top-actions">
            {stats && <span className="meta">Yangilandi: {formatSeen(stats.generated_at).toLowerCase()}</span>}
            <button type="button" className="btn btn-outline btn-sm" onClick={refresh} disabled={loading}>
              {loading ? <SpinnerIcon size={16} className="spin" /> : <RefreshIcon size={16} />}
              Yangilash
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {error && (
          <p className="admin-error" role="alert">
            <AlertIcon size={16} />
            <span>Statistikani yuklab boʻlmadi: {error}</span>
          </p>
        )}

        {!stats && loading && <StatsSkeleton />}

        {stats && (
          <>
            <section className="admin-kpis" aria-label="Asosiy koʻrsatkichlar">
              {kpis(stats).map((kpi) => (
                <div key={kpi.label} className="card admin-kpi">
                  <span className="admin-kpi-label">{kpi.label}</span>
                  <span className="admin-kpi-value">{kpi.value}</span>
                  <span className={kpi.alert ? "admin-kpi-note alert" : "admin-kpi-note"}>{kpi.note}</span>
                </div>
              ))}
            </section>

            <div className="admin-charts">
              <DailyBars title="Yangi foydalanuvchilar" data={stats.new_users_daily} />
              <DailyBars title="Hisoblangan kuzatuvlar" data={stats.observations_daily} />
            </div>

            <div className="admin-panels">
              <section className="card" aria-labelledby="admin-alerts-title">
                <div className="admin-card-head">
                  <h2 id="admin-alerts-title">Ogohlantirishlar</h2>
                  <span className="meta">30 kun</span>
                </div>
                <HBars
                  rows={[
                    { label: "NDVI pasayishi", value: stats.alerts_30d.ndvi_drop },
                    { label: "Suv stressi (NDMI)", value: stats.alerts_30d.ndmi_stress },
                    { label: "Azot kam (NDRE)", value: stats.alerts_30d.ndre_low },
                    { label: "Sovuq", value: stats.alerts_30d.frost },
                    { label: "Jazirama", value: stats.alerts_30d.heat },
                  ]}
                />
              </section>

              <section className="card" aria-labelledby="admin-methods-title">
                <div className="admin-card-head">
                  <h2 id="admin-methods-title">Kirish usuli</h2>
                  <span className="meta">{formatNumber(stats.users_total)} foydalanuvchi</span>
                </div>
                <HBars
                  rows={[
                    { label: "Faqat Telegram", value: stats.sign_in_methods.telegram_only },
                    { label: "Faqat parol", value: stats.sign_in_methods.password_only },
                    { label: "Ikkalasi", value: stats.sign_in_methods.both },
                  ]}
                />
                <p className="meta">
                  Maydoni yoʻq foydalanuvchilar: <strong>{formatNumber(stats.users_without_fields)}</strong>
                </p>
              </section>

              <section className="card" aria-labelledby="admin-system-title">
                <h2 id="admin-system-title">Tizim holati</h2>
                <ul className="admin-status">
                  {systemStatus(stats).map((item, index) => {
                    const Icon = STATUS_ICONS[item.level];
                    return (
                      <li key={index} className={item.level}>
                        <span className="admin-status-icon" aria-hidden="true">
                          <Icon size={14} strokeWidth={2.5} />
                        </span>
                        <span>{item.content}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </>
        )}

        <AdminUsers refreshKey={refreshKey} />
      </main>
    </div>
  );
}
