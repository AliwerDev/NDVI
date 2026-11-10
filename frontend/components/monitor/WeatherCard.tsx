import {
  CloudRainIcon,
  CloudSunIcon,
  DropletIcon,
  SnowflakeIcon,
  SunIcon,
  ThermometerIcon,
  WindIcon,
} from "@/components/icons";
import type { FieldWeather, IrrigationAdvice, WeatherDay } from "@/lib/api";
import {
  dayMonthWeekday,
  firstPeriod,
  formatNumber,
  formatPeriod,
  formatTemp,
  weekdayShort,
  type WeatherPeriod,
} from "@/lib/weather";

const FORECAST_DAYS = 7;
// A balance below this (mm) is shown in red: the same limit as the irrigation advice of the backend.
const DRY_BALANCE = -20;

const IRRIGATION: Record<IrrigationAdvice["level"], { chip: string; tone: string }> = {
  needed: { chip: "Kerak", tone: "danger" },
  wait_rain: { chip: "Yomgʻir kutilmoqda", tone: "info" },
  ok: { chip: "Shart emas", tone: "ok" },
};

type Props = {
  weather: FieldWeather | null;
  loading: boolean;
  failed: boolean;
};

function PeriodBanner({ period }: { period: WeatherPeriod }) {
  const frost = period.kind === "frost";
  return (
    <div role="status" className={`wx-banner ${frost ? "wx-banner-frost" : "wx-banner-heat"}`}>
      {frost ? <SnowflakeIcon size={18} /> : <ThermometerIcon size={18} />}
      <div>
        <strong>
          {frost ? "Sovuq xavfi" : "Jazirama"}: {formatPeriod(period.first, period.last)}
        </strong>
        <span>
          {frost
            ? `Kechasi ${formatNumber(period.value)} °C gacha sovuq kutilmoqda. Sovuqdan bir kun oldin sugʻorish tuproq issiqligini saqlaydi.`
            : `Kunduzi ${formatNumber(period.value)} °C gacha issiq kutilmoqda. Sugʻorishni erta tongda yoki kechqurun qiling.`}
        </span>
      </div>
    </div>
  );
}

function DayCell({ day, today, frost, heat }: { day: WeatherDay; today: boolean; frost: number; heat: number }) {
  const isHeat = day.t_max !== null && day.t_max >= heat;
  const isFrost = day.t_min !== null && day.t_min <= frost;
  const rain = day.precipitation ?? 0;
  const label = `${today ? "Bugun" : dayMonthWeekday(day.day)}: ${formatTemp(day.t_max)} / ${formatTemp(day.t_min)}, yogʻin ${formatNumber(rain)} mm`;
  return (
    <li className={`wx-day${isHeat ? " wx-day-heat" : isFrost ? " wx-day-frost" : ""}`} aria-label={label}>
      <span className="wx-day-name" aria-hidden="true">
        {today ? "Bugun" : weekdayShort(day.day)}
      </span>
      <span className="wx-day-date" aria-hidden="true">
        {Number(day.day.slice(8))}
      </span>
      {rain >= 1 ? (
        <CloudRainIcon size={20} className="wx-icon-rain" />
      ) : (
        <SunIcon size={20} className={isHeat ? "wx-icon-heat" : "wx-icon-sun"} />
      )}
      <span className="wx-day-max" aria-hidden="true">
        {formatTemp(day.t_max)}
      </span>
      <span className="wx-day-min" aria-hidden="true">
        {formatTemp(day.t_min)}
      </span>
      <span className={rain > 0 ? "wx-day-rain wx-day-rain-on" : "wx-day-rain"} aria-hidden="true">
        {rain > 0 ? formatNumber(rain) : "—"}
      </span>
    </li>
  );
}

// The weather of the selected field: 7-day forecast, frost and heat warnings, the last 7 days, and the advice.
export default function WeatherCard({ weather, loading, failed }: Props) {
  const forecast = weather?.days.filter((d) => d.is_forecast).slice(0, FORECAST_DAYS) ?? [];
  const periods = weather
    ? [firstPeriod(forecast, "frost", weather.frost_threshold_c), firstPeriod(forecast, "heat", weather.heat_threshold_c)]
    : [];
  const summary = weather?.summary_7d ?? null;
  const advice = weather?.irrigation_advice ?? null;
  const irrigation = advice ? IRRIGATION[advice.level] : null;
  const today = forecast[0]?.day;

  return (
    <section className="card" aria-labelledby="wx-title" aria-busy={loading}>
      <div className="card-head">
        <h2 id="wx-title" className="card-title-icon">
          <CloudSunIcon size={18} className="accent-icon" />
          Ob-havo
        </h2>
        <span className="meta">{FORECAST_DAYS} kunlik prognoz</span>
      </div>

      {!weather && loading && <span className="sk wx-skeleton" role="status" aria-label="Ob-havo yuklanmoqda" />}
      {!weather && !loading && (
        <p className="obs-stats-note">
          {failed ? "Ob-havo maʼlumotini olib boʻlmadi. Keyinroq qayta urinib koʻring." : "Ob-havo maʼlumoti hali yoʻq."}
        </p>
      )}

      {weather && (
        <>
          {periods.map((period) => period && <PeriodBanner key={period.kind} period={period} />)}

          {forecast.length > 0 ? (
            <>
              <ol className="wx-days" aria-label="Kunlik prognoz">
                {forecast.map((day) => (
                  <DayCell
                    key={day.day}
                    day={day}
                    today={day.day === today}
                    frost={weather.frost_threshold_c}
                    heat={weather.heat_threshold_c}
                  />
                ))}
              </ol>
              <p className="meta wx-legend">Kunduzgi max / kechki min, °C · yogʻin, mm</p>
            </>
          ) : (
            <p className="obs-stats-note">Prognoz hali yuklanmagan.</p>
          )}

          {summary && (
            <div className="wx-summary">
              <span className="wx-summary-title">Oldingi {summary.days} kun</span>
              <dl>
                <div>
                  <dt>Yogʻin</dt>
                  <dd>{formatNumber(summary.precipitation)} mm</dd>
                </div>
                <div>
                  <dt>Bugʻlanish (ET0)</dt>
                  <dd>{formatNumber(summary.et0)} mm</dd>
                </div>
                <div>
                  <dt>Suv balansi</dt>
                  <dd className={summary.balance <= DRY_BALANCE ? "wx-dry" : undefined}>
                    {summary.balance > 0 ? "+" : ""}
                    {formatNumber(summary.balance)} mm
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {advice && irrigation && (
            <>
              <div className="wx-block">
                <div className="card-head">
                  <h3 className="card-title-icon wx-block-title">
                    <DropletIcon size={16} className="wx-icon-rain" />
                    Sugʻorish
                  </h3>
                  <span className={`status-chip status-${irrigation.tone}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {irrigation.chip}
                  </span>
                </div>
                <p className="wx-text">{advice.text}</p>
              </div>

              <div className="wx-block wx-block-sep">
                <h3 className="card-title-icon wx-block-title">
                  <WindIcon size={16} className="accent-icon" />
                  Purkash va oʻgʻitlash
                </h3>
                <p className="wx-text">
                  {weather.spray_day
                    ? `Qulay kun: ${weather.spray_day === today ? "bugun, " : ""}${dayMonthWeekday(weather.spray_day)}. Yogʻinsiz, shamol sust, jazirama emas.`
                    : "Keyingi kunlarda qulay kun yoʻq: yogʻin, kuchli shamol yoki jazirama kutilmoqda."}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
