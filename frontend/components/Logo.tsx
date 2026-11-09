import { useId } from "react";

// "Pixel leaf": a leaf cut into a 3 × 3 grid of satellite pixels, colored with the NDVI ramp
// from the tip (low) to the stem (high). Keep these colors equal to app/icon.svg.
const LEAF = "M10 54C10 27 27 10 54 10C54 37 37 54 10 54Z";
const CELL = 44 / 3;
const GAP = 1.5;
const COLORS = [
  ["#66bd63", "#1a9850", "#006837"],
  ["#a6d96a", "#66bd63", "#1a9850"],
  ["#fee08b", "#a6d96a", "#66bd63"],
];

type Props = {
  size?: number;
  /** One color for all pixels, for example "currentColor" on a dark background. */
  mono?: string;
  title?: string;
  className?: string;
};

export default function LogoMark({ size = 40, mono, title, className }: Props) {
  // The clip id must be unique on the page and safe inside url(#...).
  const clipId = `leaf-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={LEAF} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {COLORS.map((row, r) =>
          row.map((color, c) => (
            <rect
              key={`${r}-${c}`}
              x={10 + c * CELL + GAP / 2}
              y={10 + r * CELL + GAP / 2}
              width={CELL - GAP}
              height={CELL - GAP}
              fill={mono ?? color}
            />
          )),
        )}
      </g>
    </svg>
  );
}
