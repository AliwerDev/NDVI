import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function icon(paths: ReactNode, defaults: { strokeWidth?: number } = {}) {
  return function Icon({ size = 16, strokeWidth = defaults.strokeWidth ?? 2, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const LeafIcon = icon(
  <>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </>,
  { strokeWidth: 1.8 },
);

export const GlobeIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
  </>,
);

export const MapIcon = icon(
  <>
    <path d="M14.1 6 9.9 4 3 6.6v13.4l6.9-2.6 4.2 2 6.9-2.6V3.4Z" />
    <path d="M9.9 4v13.4M14.1 6v13.4" />
  </>,
);

export const PlusIcon = icon(<path d="M5 12h14M12 5v14" />, { strokeWidth: 2.2 });

export const MinusIcon = icon(<path d="M5 12h14" />);

export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />, { strokeWidth: 2.5 });

export const SendIcon = icon(
  <>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </>,
);

export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
);

export const ActivityIcon = icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />);

export const HistoryIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </>,
);

export const TrashIcon = icon(
  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
);

export const CrosshairIcon = icon(
  <>
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
    <circle cx="12" cy="12" r="2" />
  </>,
);

export const UndoIcon = icon(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </>,
);

export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);

export const PinIcon = icon(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>,
);

export const SpinnerIcon = icon(<path d="M21 12a9 9 0 1 1-6.219-8.56" />, { strokeWidth: 2.5 });

export const AlertIcon = icon(<path d="M12 7v6M12 17h.01" />, { strokeWidth: 2.5 });

export const CloseIcon = icon(<path d="M18 6 6 18M6 6l12 12" />);

export const ExpandIcon = icon(<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />);

export const ChartIcon = icon(
  <>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-4 3 3 5-6" />
  </>,
  { strokeWidth: 1.8 },
);

export const FieldsIcon = icon(
  <>
    <path d="M4 6l7-3 9 4v11l-7 3-9-4Z" />
    <path d="M11 3v18" />
  </>,
  { strokeWidth: 1.8 },
);
