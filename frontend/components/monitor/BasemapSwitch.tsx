"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { LayersIcon } from "@/components/icons";
import type { Basemap } from "@/components/MapView";

const SATELLITE_THUMB = (
  <svg viewBox="0 0 80 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="80" height="80" fill="#3f4a33" />
    <g transform="rotate(-8 40 40)">
      <rect x="-6" y="-4" width="30" height="26" fill="#6b7a43" />
      <rect x="26" y="-4" width="26" height="26" fill="#8a7d55" />
      <rect x="54" y="-4" width="34" height="26" fill="#55703a" />
      <rect x="-6" y="24" width="40" height="22" fill="#7d8c4e" />
      <rect x="36" y="24" width="22" height="22" fill="#a08f63" />
      <rect x="60" y="24" width="28" height="22" fill="#4c6534" />
      <rect x="-6" y="48" width="24" height="40" fill="#5d6e3c" />
      <rect x="20" y="48" width="36" height="40" fill="#93a35c" />
      <rect x="58" y="48" width="30" height="40" fill="#6f6448" />
    </g>
  </svg>
);

const MAP_THUMB = (
  <svg viewBox="0 0 80 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="80" height="80" fill="#f2efe9" />
    <path d="M0 58 C20 50 30 64 52 56 S80 50 80 50 V80 H0Z" fill="#aad3df" />
    <rect x="48" y="6" width="22" height="16" rx="2" fill="#c8e6b0" />
    <path d="M-2 32 L82 24" stroke="#ffffff" strokeWidth="5" />
    <path d="M-2 32 L82 24" stroke="#f7c87a" strokeWidth="3" />
    <path d="M28 -2 L36 82" stroke="#ffffff" strokeWidth="4" />
    <path d="M8 -2 L18 50 L4 82" stroke="#ffffff" strokeWidth="2" />
  </svg>
);

const OPTIONS: { value: Basemap; label: string; thumb: ReactNode }[] = [
  { value: "satellite", label: "Sunʼiy yoʻldosh", thumb: SATELLITE_THUMB },
  { value: "osm", label: "Xarita", thumb: MAP_THUMB },
];

type Props = {
  value: Basemap;
  onChange: (value: Basemap) => void;
};

export default function BasemapSwitch({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const labelId = useId();

  // A click outside the control (the map too) closes the menu.
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="basemap-switch"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="basemap-toggle"
        aria-label="Xarita turi"
        title="Xarita turi"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <LayersIcon size={22} strokeWidth={2} />
      </button>
      {open && (
        <div id={menuId} className="basemap-menu">
          <span id={labelId} className="label">
            Xarita turi
          </span>
          <div role="radiogroup" aria-labelledby={labelId} className="basemap-options">
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={value === option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="basemap-thumb">{option.thumb}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
