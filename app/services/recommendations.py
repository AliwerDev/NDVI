"""Advice for the farmer: nitrogen from NDRE, irrigation from the weather and NDMI, a day for spraying.

The website and the Telegram bot show the same text.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.config import Settings
from app.models import WeatherDay
from app.services.weather import WeatherSummary

NitrogenLevel = Literal["low", "medium", "ok", "unknown"]


@dataclass(frozen=True)
class NitrogenAdvice:
    level: NitrogenLevel
    text: str
    low_threshold: float
    ok_threshold: float


def nitrogen_level(ndre_mean: float | None, ndvi_mean: float, settings: Settings) -> NitrogenLevel | None:
    """The nitrogen status of an observation, or None if it has no NDRE value."""
    if ndre_mean is None:
        return None
    # Bare soil and young sparse plants also give a low NDRE, so it says nothing about nitrogen there.
    if ndvi_mean < settings.ndre_min_ndvi:
        return "unknown"
    if ndre_mean < settings.ndre_low_threshold:
        return "low"
    if ndre_mean < settings.ndre_ok_threshold:
        return "medium"
    return "ok"


def nitrogen_advice(ndre_mean: float | None, ndvi_mean: float, settings: Settings) -> NitrogenAdvice | None:
    level = nitrogen_level(ndre_mean, ndvi_mean, settings)
    if level is None:
        return None
    texts: dict[NitrogenLevel, str] = {
        "low": (
            "Barglarda xlorofill kam — azot yetishmasligi ehtimoli bor. Dalaning past qiymatli qismini "
            "koʻzdan kechiring va azotli oʻgʻit berishni agronom bilan kelishing."
        ),
        "medium": "Azot darajasi oʻrtacha. Keyingi 1–2 kuzatuvda NDRE pasaysa, oziqlantirishni rejalang.",
        "ok": "Azot yetarli. Qoʻshimcha oziqlantirish hozir kerak emas.",
        "unknown": (
            f"NDVI {settings.ndre_min_ndvi:.2f} dan past — oʻsimlik hali siyrak, NDRE ishonchli emas. "
            "Baho berilmaydi."
        ),
    }
    return NitrogenAdvice(
        level=level,
        text=texts[level],
        low_threshold=settings.ndre_low_threshold,
        ok_threshold=settings.ndre_ok_threshold,
    )


IrrigationLevel = Literal["needed", "wait_rain", "ok"]


@dataclass(frozen=True)
class IrrigationAdvice:
    level: IrrigationLevel
    text: str
    # ET0 minus rain of the last 7 days, in mm. A positive value means that the soil lost water.
    deficit_mm: float
    forecast_rain_mm: float


def irrigation_advice(
    ndmi_mean: float | None, summary: WeatherSummary | None, forecast_rain: float, settings: Settings
) -> IrrigationAdvice | None:
    """Irrigation advice from the water balance of the last 7 days, or None without weather data.

    A low NDMI also asks for water, because the leaves already show the stress.
    """
    if summary is None:
        return None
    deficit = round(summary.et0 - summary.precipitation, 1)
    dry_leaves = ndmi_mean is not None and ndmi_mean < settings.ndmi_stress_threshold
    balance = (
        f"Oxirgi {summary.days} kunda bugʻlanish (ET0) {summary.et0:.0f} mm, yogʻin {summary.precipitation:.0f} mm."
    )

    if deficit < settings.irrigation_deficit_mm and not dry_leaves:
        level: IrrigationLevel = "ok"
        text = f"{balance} Hozir qoʻshimcha sugʻorish shart emas."
    elif forecast_rain >= settings.rain_skip_mm:
        level = "wait_rain"
        text = (
            f"{balance} Keyingi 3 kunda {forecast_rain:.0f} mm yogʻin kutilmoqda: "
            "sugʻorishni yomgʻirdan keyingacha kechiktirsa boʻladi."
        )
    else:
        level = "needed"
        leaves = " Barglar namligi ham past (NDMI)." if dry_leaves else ""
        text = f"{balance} Tuproq taxminan {max(deficit, 0):.0f} mm suv yoʻqotdi.{leaves} Sugʻorishni rejalang."
    return IrrigationAdvice(level=level, text=text, deficit_mm=deficit, forecast_rain_mm=round(forecast_rain, 1))


def forecast_rain(days: Sequence[WeatherDay], count: int = 3) -> float:
    """Rain of the first `count` forecast days, in mm. Empty values count as 0."""
    return sum(d.precipitation or 0.0 for d in days[:count])


def spray_day(days: Sequence[WeatherDay], settings: Settings) -> date | None:
    """The first forecast day without rain, strong wind and heat, for spraying or fertilizing. None if there is none.

    On a heat day the spray dries before the leaves take it up, so the heat warning tells the farmer to wait.
    """
    for d in days:
        if (
            d.precipitation is not None
            and d.wind_max is not None
            and d.precipitation < settings.spray_max_rain_mm
            and d.wind_max < settings.spray_max_wind
            and (d.t_max is None or d.t_max < settings.heat_threshold_c)
        ):
            return d.day
    return None
