"""User-facing bot texts in Uzbek (Latin script)."""

from datetime import date

WELCOME = (
    "Assalomu alaykum! 🌱\n\n"
    "Men maydonlaringizni Sentinel-2 sunʼiy yoʻldosh suratlari orqali kuzataman. "
    "NDVI (oʻsimlik holati koʻrsatkichi) keskin tushsa, sizga xabar yuboraman.\n\n"
    "Buyruqlar:\n"
    "/link <raqam> — maydonni ulash (masalan: /link 3)\n"
    "/unlink <raqam> — maydonni uzish\n"
    "/fields — ulangan maydonlar va oxirgi NDVI"
)

LINK_USAGE = "Maydon raqamini yozing. Masalan: /link 3"
UNLINK_USAGE = "Maydon raqamini yozing. Masalan: /unlink 3"
NO_FIELDS = "Sizda ulangan maydon yoʻq. Maydonni ulash uchun: /link <raqam>"


def field_not_found(field_id: int) -> str:
    return f"{field_id} raqamli maydon topilmadi."


def linked(field_name: str) -> str:
    return f"✅ «{field_name}» maydoni ulandi. NDVI keskin tushsa, sizga xabar yuboraman."


def already_linked(field_name: str) -> str:
    return f"«{field_name}» maydoni allaqachon ulangan."


def unlinked(field_id: int) -> str:
    return f"{field_id} raqamli maydon uzildi. Endi bu maydon boʻyicha xabar kelmaydi."


def not_linked(field_id: int) -> str:
    return f"{field_id} raqamli maydon sizga ulanmagan."


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
