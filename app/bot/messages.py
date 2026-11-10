"""User-facing bot texts in Uzbek (Latin script)."""

from datetime import date, timedelta

# Telegram does not send a longer message.
MESSAGE_LIMIT = 4096

# The bot menu. The bot sends this list to Telegram when it starts.
COMMANDS = (
    ("start", "Bot haqida va qanday ulanish"),
    ("fields", "Maydonlarim va oxirgi NDVI"),
    ("weather", "Ob-havo prognozi va maslahatlar"),
)

WELCOME = (
    "Assalomu alaykum! 🌱\n\n"
    "Men maydonlaringizni Sentinel-2 sunʼiy yoʻldosh suratlari orqali kuzataman va sizga xabar yuboraman:\n"
    "• NDVI (oʻsimlik holati) keskin tushsa;\n"
    "• NDMI (barg namligi) suv stressini koʻrsatsa;\n"
    "• NDRE (xlorofill) azot yetishmasligini koʻrsatsa.\n\n"
    "Saytga Telegram orqali kiring yoki saytda «Telegramni ulash» tugmasini bosing. "
    "Shundan keyin barcha maydonlaringiz boʻyicha ogohlantirishlar shu chatga keladi.\n\n"
    "/fields — maydonlaringiz va oxirgi NDVI\n"
    "/weather — ob-havo prognozi, sugʻorish va purkash maslahati"
)

NO_FORECAST = "Prognoz hali yoʻq. Birozdan keyin qayta urinib koʻring."

NO_FIELDS = "Bu Telegram hisobiga ulangan maydon yoʻq. Saytga Telegram orqali kiring yoki «Telegramni ulash» tugmasini bosing."

LOGIN_CONFIRMED = "✅ Saytga kirish tasdiqlandi. Brauzerga qayting.\n\nNDVI ogohlantirishlari shu chatga keladi."
LOGIN_EXPIRED = (
    "Bu kirish havolasi eskirgan yoki ishlatilgan. Saytda «Telegram orqali kirish» tugmasini qayta bosing."
)

LINKED = "✅ Telegram hisobingizga ulandi. Endi barcha maydonlaringiz boʻyicha NDVI ogohlantirishlari shu chatga keladi."
ALREADY_LINKED = "Bu Telegram hisobingizga allaqachon ulangan. Ogohlantirishlar shu chatga keladi."
LINK_TAKEN = (
    "Bu Telegram boshqa hisobga ulangan. Saytdan oʻsha hisob bilan kiring yoki boshqa Telegram hisobidan foydalaning."
)
LINK_EXPIRED = "Bu havola eskirgan yoki ishlatilgan. Saytda «Telegramni ulash» tugmasini qayta bosing."


def _format_date(day: date) -> str:
    return day.strftime("%d.%m.%Y")


def field_line(
    field_id: int,
    field_name: str,
    ndvi: float | None,
    observed_on: date | None,
    ndmi: float | None = None,
    ndre: float | None = None,
    area: str | None = None,
) -> str:
    """One line of the /fields list. NDMI and NDRE are left out when the observation has no value for them."""
    if area is not None:
        field_name = f"{field_name} ({area})"
    if ndvi is None or observed_on is None:
        return f"{field_id}. {field_name} — hali NDVI maʼlumoti yoʻq"
    values = [f"NDVI {ndvi:.2f}"]
    if ndmi is not None:
        values.append(f"NDMI {ndmi:.2f}")
    if ndre is not None:
        values.append(f"NDRE {ndre:.2f}")
    return f"{field_id}. {field_name} — {', '.join(values)} ({_format_date(observed_on)})"


def fields_list(lines: list[str]) -> str:
    return "Ulangan maydonlar:\n\n" + "\n".join(lines)


def ndvi_drop_alert(
    field_name: str,
    previous_date: date,
    previous_ndvi: float,
    current_date: date,
    current_ndvi: float,
    drop: float,
) -> str:
    """Alert text for a sharp NDVI drop."""
    return (
        f"⚠️ Diqqat! «{field_name}» maydonida NDVI keskin tushdi.\n\n"
        f"{_format_date(previous_date)}: {previous_ndvi:.2f}\n"
        f"{_format_date(current_date)}: {current_ndvi:.2f}\n"
        f"Pasayish: {drop:.2f}\n\n"
        "Maydonni tekshirib koʻring: suv yetishmasligi, zararkunanda yoki kasallik boʻlishi mumkin."
    )


def ndmi_stress_alert(
    field_name: str,
    previous_date: date | None,
    previous_ndmi: float | None,
    current_date: date,
    current_ndmi: float,
    drop: float | None,
    stress_threshold: float,
) -> str:
    """Water stress alert: NDMI is below the threshold, or it fell sharply."""
    lines = []
    if previous_date is not None and previous_ndmi is not None:
        lines.append(f"{_format_date(previous_date)}: {previous_ndmi:.2f}")
    lines.append(f"{_format_date(current_date)}: {current_ndmi:.2f}")

    if current_ndmi < stress_threshold:
        lines.append(f"Chegara: {stress_threshold:.2f}")
        return (
            f"💧 Suv stressi! «{field_name}» maydonida NDMI chegaradan pastga tushdi.\n\n"
            + "\n".join(lines)
            + "\n\nSugʻorishni tekshiring: ariq yoki tomchilatib sugʻorish tizimi ishlayaptimi, "
            "suv dalaning hamma qismiga yetib boryaptimi."
        )

    if drop is not None:
        lines.append(f"Pasayish: {drop:.2f}")
    return (
        f"💧 Diqqat! «{field_name}» maydonida NDMI keskin tushdi.\n\n"
        + "\n".join(lines)
        + "\n\nBarglarda namlik kamaymoqda. Sugʻorish jadvalini va suv yetib borishini tekshiring."
    )


def ndre_low_alert(
    field_name: str, observed_on: date, ndre: float, ndvi: float, low_threshold: float, advice: str
) -> str:
    """Nitrogen advice: NDRE became low."""
    return (
        f"🌿 Azot tavsiyasi: «{field_name}»\n\n"
        f"{_format_date(observed_on)}: NDRE {ndre:.2f} (chegara {low_threshold:.2f})\n"
        f"NDVI {ndvi:.2f}\n\n"
        f"{advice}\n\n"
        "Bu sunʼiy yoʻldosh bahosi. Qaror oldidan dalani tekshiring."
    )


def _format_period(first: date, last: date) -> str:
    if first == last:
        return _format_date(first)
    return f"{_format_date(first)}–{_format_date(last)}"


def weather_context(days: int, precipitation: float, et0: float, t_max: float | None) -> str:
    """The weather before an observation. It helps to find the cause of a change in the indices."""
    values = [f"yogʻin {precipitation:.0f} mm"]
    if t_max is not None:
        values.append(f"eng yuqori harorat {t_max:.0f} °C")
    values.append(f"bugʻlanish (ET0) {et0:.0f} mm")
    return f"🌦 Oldingi {days} kun ob-havosi (taxminiy): " + ", ".join(values) + "."


def frost_alert(field_name: str, first: date, last: date, t_min: float, threshold: float) -> str:
    """Frost warning from the forecast."""
    return (
        f"❄️ Sovuq xavfi: «{field_name}»\n\n"
        f"{_format_period(first, last)}: kechasi {t_min:.1f} °C gacha sovuq kutilmoqda "
        f"(prognoz, chegara {threshold:.0f} °C).\n\n"
        "Ekinni himoya qiling: sovuqdan bir kun oldin sugʻorish tuproq issiqligini saqlaydi. "
        "Bu kunlarga purkash va oʻgʻitlashni rejalashtirmang."
    )


def heat_alert(field_name: str, first: date, last: date, t_max: float, threshold: float) -> str:
    """Heat warning from the forecast."""
    return (
        f"🔥 Jazirama: «{field_name}»\n\n"
        f"{_format_period(first, last)}: kunduzi {t_max:.1f} °C gacha issiq kutilmoqda "
        f"(prognoz, chegara {threshold:.0f} °C).\n\n"
        "Sugʻorishni kechiktirmang, uni erta tongda yoki kechqurun qiling. "
        "Issiq soatlarda purkash va oʻgʻitlash qilmang."
    )


def irrigation_line(text: str) -> str:
    return f"💧 Sugʻorish: {text}"


def forecast_day_line(
    day: date,
    today: date,
    t_min: float | None,
    t_max: float | None,
    precipitation: float | None,
    wind_max: float | None,
    frost_threshold: float,
    heat_threshold: float,
) -> str:
    """One forecast day of /weather. Frost and heat days get a mark, with the same rule as the alerts."""
    label = day.strftime("%d.%m")
    if day == today:
        label = f"Bugun, {label}"
    elif day == today + timedelta(days=1):
        label = f"Ertaga, {label}"

    values = []
    if t_min is not None and t_max is not None:
        values.append(f"{t_min:.0f}…{t_max:.0f} °C")
    if precipitation is not None:
        values.append(f"yogʻin {precipitation:.0f} mm")
    if wind_max is not None:
        values.append(f"shamol {wind_max:.0f} m/s")

    marks = ""
    if t_min is not None and t_min <= frost_threshold:
        marks += " ❄️ sovuq"
    if t_max is not None and t_max >= heat_threshold:
        marks += " 🔥 jazirama"
    return f"{label}: {', '.join(values) or 'maʼlumot yoʻq'}{marks}"


def field_weather(field_name: str, day_lines: list[str], advice_lines: list[str]) -> str:
    """The /weather block of one field: the forecast days, then the irrigation and spray advice."""
    forecast = "\n".join(day_lines) if day_lines else NO_FORECAST
    return "\n\n".join([f"🌦 «{field_name}» ob-havosi\n\n{forecast}", *advice_lines])


def split_messages(blocks: list[str], limit: int = MESSAGE_LIMIT) -> list[str]:
    """Join the blocks into as few messages as possible. A block is never cut, unless it is longer than the limit."""
    parts: list[str] = []
    for block in blocks:
        if parts and len(parts[-1]) + 2 + len(block) <= limit:
            parts[-1] += "\n\n" + block
        else:
            parts.append(block[:limit])
    return parts


def spray_line(day: date | None) -> str:
    """The forecast day for spraying or fertilizing."""
    if day is None:
        return "🧴 Keyingi kunlarda purkash va oʻgʻitlash uchun qulay kun yoʻq: yogʻin yoki kuchli shamol kutilmoqda."
    return f"🧴 Purkash va oʻgʻitlash uchun qulay kun: {_format_date(day)} (prognoz: yogʻinsiz, shamol sust)."
