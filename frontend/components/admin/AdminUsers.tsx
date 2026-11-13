"use client";

import { useEffect, useState } from "react";

import { formatDay, formatNumber, formatSeen } from "@/components/admin/format";
import { AlertIcon, SearchIcon } from "@/components/icons";
import { api, type AdminUserPage, type AdminUserSort, errorText } from "@/lib/api";
import { formatArea } from "@/lib/geo";
import { formatDayMonth } from "@/lib/ndvi";

const PER_PAGE = 20;
const SEARCH_DELAY_MS = 300;

type Column = { label: string; sort?: AdminUserSort; numeric?: boolean };

const COLUMNS: Column[] = [
  { label: "Foydalanuvchi", sort: "name" },
  { label: "Telegram" },
  { label: "Maydonlar", sort: "fields", numeric: true },
  { label: "Yuza", sort: "area", numeric: true },
  { label: "Kuzatuvlar", sort: "observations", numeric: true },
  { label: "Oxirgi kuzatuv" },
  { label: "Roʻyxatdan oʻtgan", sort: "created" },
  { label: "Oxirgi faollik", sort: "last_seen" },
];

type Props = {
  // A new value reloads the current page (the "Yangilash" button).
  refreshKey: number;
};

export default function AdminUsers({ refreshKey }: Props) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AdminUserSort>("last_seen");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(input.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    // A slow answer for an old query must not replace the answer for the new one.
    let current = true;
    setLoading(true);
    api
      .adminUsers({ q: query, sort, order, page, perPage: PER_PAGE })
      .then((result) => {
        if (!current) return;
        setData(result);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [query, sort, order, page, refreshKey]);

  const sortBy = (column: AdminUserSort) => {
    if (column === sort) {
      setOrder((value) => (value === "desc" ? "asc" : "desc"));
    } else {
      setSort(column);
      // Names read A to Z. Numbers and dates start with the biggest or newest.
      setOrder(column === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const last = Math.min(page * PER_PAGE, total);

  return (
    <section className="card admin-users" aria-labelledby="admin-users-title" aria-busy={loading}>
      <div className="admin-users-head">
        <h2 id="admin-users-title">
          Foydalanuvchilar {data && <span className="admin-count">{formatNumber(total)}</span>}
        </h2>
        <label className="admin-search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ism, login yoki Telegram"
            aria-label="Foydalanuvchi qidirish"
          />
        </label>
      </div>

      {error && (
        <p className="admin-error" role="alert">
          <AlertIcon size={16} />
          <span>{error}</span>
        </p>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const active = column.sort !== undefined && column.sort === sort;
                return (
                  <th
                    key={column.label}
                    scope="col"
                    className={column.numeric ? "num" : undefined}
                    aria-sort={active ? (order === "desc" ? "descending" : "ascending") : undefined}
                  >
                    {column.sort ? (
                      <button
                        type="button"
                        className={active ? "admin-sort active" : "admin-sort"}
                        onClick={() => sortBy(column.sort as AdminUserSort)}
                      >
                        {column.label}
                        <span aria-hidden="true">{active ? (order === "desc" ? "↓" : "↑") : ""}</span>
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data?.items.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="admin-user">
                    <span className="admin-avatar" aria-hidden="true">
                      {user.display_name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <span className="admin-user-name">
                        {user.display_name}
                        {user.is_admin && <span className="admin-tag">admin</span>}
                      </span>
                      <span className="meta">{user.username ?? "Faqat Telegram"}</span>
                    </div>
                  </div>
                </td>
                <td className={user.telegram_linked ? undefined : "muted"}>
                  {user.telegram_linked ? (user.telegram_username ? `@${user.telegram_username}` : "Ulangan") : "Ulanmagan"}
                </td>
                <td className="num">{formatNumber(user.fields)}</td>
                <td className="num">{user.fields > 0 ? formatArea(user.area_ha) : "—"}</td>
                <td className="num">{formatNumber(user.observations)}</td>
                <td>{user.last_observed_on ? formatDayMonth(user.last_observed_on) : "—"}</td>
                <td>{formatDay(user.created_at)}</td>
                <td>{formatSeen(user.last_seen_at)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="admin-empty">
                  {query ? "Hech kim topilmadi." : "Hali foydalanuvchi yoʻq."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pager">
        <span className="meta">
          {first}–{last} / {formatNumber(total)}
        </span>
        <div>
          <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
            Oldingi
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={last >= total || loading}
            onClick={() => setPage(page + 1)}
          >
            Keyingi
          </button>
        </div>
      </div>
    </section>
  );
}
