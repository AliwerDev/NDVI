"""Nitrogen advice from NDRE. The website and the Telegram bot show the same text."""

from dataclasses import dataclass
from typing import Literal

from app.config import Settings

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
