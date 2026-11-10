import { CloudRainIcon } from "@/components/icons";
import type { WeatherDay } from "@/lib/api";
import { formatNumber, totalsBefore } from "@/lib/weather";

type Props = {
  days: WeatherDay[];
  observedOn: string;
};

// The weather of the 7 days before an observation. It helps to explain a change in the indices.
export default function ObservationWeather({ days, observedOn }: Props) {
  const totals = totalsBefore(days, observedOn);
  if (!totals) return null;

  const values = [`yogʻin ${formatNumber(totals.precipitation)} mm`];
  if (totals.tMax !== null) values.push(`eng yuqori ${formatNumber(Math.round(totals.tMax))} °C`);
  values.push(`bugʻlanish (ET0) ${formatNumber(totals.et0)} mm`);

  return (
    <div className="wx-context">
      <CloudRainIcon size={18} className="wx-icon-rain" />
      <div>
        <span className="wx-context-title">Kuzatuvdan oldingi {totals.days} kun</span>
        <span className="wx-context-text">{values.join(" · ")}</span>
      </div>
    </div>
  );
}
