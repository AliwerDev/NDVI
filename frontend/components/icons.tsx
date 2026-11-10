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

export const LogoutIcon = icon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>,
);

export const PencilIcon = icon(<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);

export const ArrowLeftIcon = icon(<path d="M19 12H5M11 18l-6-6 6-6" />);

export const SettingsIcon = icon(
  <>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const ImageIcon = icon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </>,
);

export const LockIcon = icon(
  <>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>,
);

export const EyeIcon = icon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const EyeOffIcon = icon(
  <>
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2" />
    <path d="M14.1 14.2a3 3 0 1 1-4.2-4.3" />
    <path d="M17.5 17.5A10 10 0 0 1 12 19c-6.5 0-10-7-10-7a17.9 17.9 0 0 1 4.5-5.5" />
    <path d="m2 2 20 20" />
  </>,
);

export const ArrowRightIcon =icon(<path d="M5 12h14M13 6l6 6-6 6" />);

export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
);

export const WarningIcon = icon(
  <>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);

export const WiltedLeafIcon = icon(
  <>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M8 11l6 6" />
  </>,
  { strokeWidth: 1.8 },
);

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

export const LayersIcon = icon(
  <>
    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
    <path d="m2 17 10 5 10-5" />
    <path d="m2 12 10 5 10-5" />
  </>,
  { strokeWidth: 1.8 },
);

export const DropletIcon = icon(<path d="M12 2.7c3.5 4 6 7.4 6 10.8a6 6 0 0 1-12 0c0-3.4 2.5-6.8 6-10.8Z" />, {
  strokeWidth: 1.8,
});

export const AreaIcon = icon(
  <>
    <path d="M4 4h16v16H4z" />
    <path d="M4 9h3M4 14h3M9 4v3M14 4v3" />
  </>,
);

export const CloudSunIcon = icon(
  <>
    <path d="M12 2v2M4.9 4.9l1.4 1.4M20 12h2M19.1 4.9l-1.4 1.4M15.9 13A4 4 0 0 0 8.3 10.6" />
    <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
  </>,
);

export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);

export const CloudRainIcon = icon(
  <>
    <path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3" />
    <path d="M8 19v2M12 17v4M16 19v2" />
  </>,
);

export const SnowflakeIcon = icon(<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />);

export const ThermometerIcon = icon(<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0Z" />);

export const WindIcon = icon(
  <path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2" />,
);
