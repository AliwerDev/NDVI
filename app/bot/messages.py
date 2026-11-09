"""User-facing bot texts in Uzbek (Latin script)."""

from datetime import date

WELCOME = (
    "Assalomu alaykum! 🌱\n\n"
    "Men maydonlaringizni Sentinel-2 sunʼiy yoʻldosh suratlari orqali kuzataman. "
    "NDVI (oʻsimlik holati koʻrsatkichi) keskin tushsa, sizga xabar yuboraman.\n\n"
    "Saytga Telegram orqali kiring yoki saytda «Telegramni ulash» tugmasini bosing. "
    "Shundan keyin barcha maydonlaringiz boʻyicha ogohlantirishlar shu chatga keladi.\n\n"
    "/fields — maydonlaringiz va oxirgi NDVI"
)

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


def field_line(field_id: int, field_name: str, ndvi: float | None, observed_on: date | None) -> str:
    """One line of the /fields list."""
    if ndvi is None or observed_on is None:
        return f"{field_id}. {field_name} — hali NDVI maʼlumoti yoʻq"
    return f"{field_id}. {field_name} — NDVI {ndvi:.2f} ({_format_date(observed_on)})"


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
