import re
from datetime import date, datetime, timedelta

INDO_MONTHS = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12,
}

# Cycle 3 fix #1: abbreviasi bulan ("okt", "nov", dst.) -- tanpa ini, "kirim 20
# Okt" tidak match sama sekali dan lead_time_days jatuh ke None, yang bikin
# guardrail salah paham sebagai "tidak ada tanggal kirim" (triage_016).
INDO_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "agu": 8, "ags": 8, "sep": 9, "okt": 10, "nov": 11, "des": 12,
}
INDO_MONTHS_LOOKUP = {**INDO_MONTHS, **INDO_MONTH_ABBR}
# Diurutkan terpanjang dulu supaya "september" dicoba sebelum "sep" -- kalau
# dibalik, "sep" bisa nyangkut duluan di tengah kata "september".
_MONTH_PATTERN = "|".join(sorted(INDO_MONTHS_LOOKUP.keys(), key=len, reverse=True))

INDO_DAYNAMES = {
    "senin": 0, "selasa": 1, "rabu": 2, "kamis": 3, "jumat": 4, "sabtu": 5, "minggu": 6,
}


def _to_date(d):
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    return datetime.fromisoformat(str(d)).date()


def parse_indo_date_string(s: str) -> date:
    """'12 Oktober 2026' -> date(2026, 10, 12)"""
    m = re.match(r"(\d{1,2})\s+(\w+)\s+(\d{4})", s.strip())
    if not m:
        raise ValueError(f"tidak bisa parse tanggal: {s!r}")
    day = int(m.group(1))
    month = INDO_MONTHS[m.group(2).lower()]
    year = int(m.group(3))
    return date(year, month, day)


def parse_text_input(text_input: str) -> dict:
    """
    Parse struktur text_input yang dikirim triageService.js:
    "Konteks RFQ: ... Rp<harga>. Tanggal RFQ dikirim: <tgl>. Target kirim: <tgl>. Balasan Supplier: <reply>"
    Field bernilai None kalau tidak ditemukan (mis. fallback ke format lama tanpa tanggal).
    """
    result = {"rfq_price": None, "dispatched_at": None, "target_delivery_date": None, "reply_text": text_input}

    m = re.search(r"Rp(\d+)", text_input)
    if m:
        result["rfq_price"] = float(m.group(1))

    m = re.search(r"Tanggal RFQ dikirim:\s*([^.]+)\.", text_input)
    if m:
        try:
            result["dispatched_at"] = parse_indo_date_string(m.group(1))
        except ValueError:
            pass

    m = re.search(r"Target kirim:\s*([^.]+)\.", text_input)
    if m:
        try:
            result["target_delivery_date"] = parse_indo_date_string(m.group(1))
        except ValueError:
            pass

    m = re.search(r"Balasan Supplier:\s*(.+)$", text_input, re.DOTALL)
    if m:
        result["reply_text"] = m.group(1).strip()

    return result


def resolve_lead_time_days(reply_text: str, dispatched_at) -> "int | None":
    """
    Hitung lead_time_days SECARA DETERMINISTIK dari teks balasan supplier,
    tanpa mempercayai lead_time_days hasil ekstraksi model triage.
    Return None kalau balasan tidak menyebut tanggal/jadwal kirim sama sekali.

    Cycle 3 fix #2: idiom "minggu ini"/"minggu depan" dicek SEBELUM day-name
    loop -- kalau dibalik, kata "minggu" di idiom itu ketangkep duluan sebagai
    nama hari (Minggu/Sunday) dan menghasilkan angka yang salah (lihat
    triage_022 di cycle.md Cycle 3c).
    """
    anchor = _to_date(dispatched_at)
    text = reply_text.lower()

    if re.search(r"\bbesok\b|\bbsk\b", text):
        return 1
    if re.search(r"\blusa\b", text):
        return 2
    if re.search(r"\bhari ini\b|\bhr ini\b", text):
        return 0

    # Cycle 3 fix #1: pola bulan sekarang termasuk abbreviasi (okt, nov, des, ...)
    m = re.search(
        rf"(?:tanggal|tgl\.?)?\s*(\d{{1,2}})\s*({_MONTH_PATTERN})\b",
        text,
    )
    if m:
        day, month, year = int(m.group(1)), INDO_MONTHS_LOOKUP[m.group(2)], anchor.year
        try:
            target = date(year, month, day)
        except ValueError:
            return None
        if target < anchor:
            target = date(year + 1, month, day)
        return (target - anchor).days

    # tanggal parsial TANPA bulan: "tanggal 19", "tgl 3"
    m = re.search(r"(?:tanggal|tgl\.?)\s*(\d{1,2})\b", text)
    if m:
        day, month, year = int(m.group(1)), anchor.month, anchor.year
        if day < anchor.day:
            month += 1
            if month > 12:
                month, year = 1, year + 1
        try:
            target = date(year, month, day)
        except ValueError:
            month += 1
            if month > 12:
                month, year = 1, year + 1
            try:
                target = date(year, month, day)
            except ValueError:
                return None
        return (target - anchor).days

    # Cycle 3 fix #2: idiom minggu duluan, sebelum day-name loop di bawah
    if re.search(r"minggu ini", text):
        return (6 - anchor.weekday()) % 7
    if re.search(r"minggu depan", text):
        return 7

    # nama hari, dengan/tanpa "depan"
    for name, weekday in INDO_DAYNAMES.items():
        if re.search(rf"\b{name}\b", text):
            days_ahead = (weekday - anchor.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            if re.search(rf"\b{name}\s+depan\b", text):
                days_ahead += 7
            return days_ahead

    m = re.search(r"(\d+)\s*hari\s*kerja", text)
    if m:
        n, d, count = int(m.group(1)), anchor, 0
        while count < n:
            d += timedelta(days=1)
            if d.weekday() < 5:
                count += 1
        return (d - anchor).days

    m = re.search(r"(\d+)\s*hari\s*lagi", text)
    if m:
        return int(m.group(1))

    return None  # tidak ada penanda tanggal sama sekali


def reply_has_any_number(reply_text: str) -> bool:
    return bool(re.search(r"\d", reply_text))


def extract_reply_price(reply_text: str) -> "float | None":
    """Ekstrak harga eksplisit dari teks balasan via regex, independen dari ai_extracted.price.

    Cycle 3 fix #3 & #4: ambil kemunculan TERAKHIR per pola (bukan pertama)
    supaya koreksi diri supplier ("70rb, eh maksud saya 78rb") kebaca benar
    (triage_042); dan kalau harga disebut sebagai TOTAL untuk qty tertentu
    ("total 2,7jt utk 30 pcs"), dibagi dulu jadi per-unit sebelum dibandingkan
    ke harga RFQ yang selalu per-unit (triage_043).
    """
    text = reply_text.lower()
    price = None

    m = list(re.finditer(r"(\d+(?:[.,]\d+)?)\s*(?:jt|juta)\b", text))
    if m:
        price = float(m[-1].group(1).replace(",", ".")) * 1_000_000

    if price is None:
        m = list(re.finditer(r"(\d+(?:[.,]\d+)?)\s*(?:rb|ribu)\b", text))
        if m:
            price = float(m[-1].group(1).replace(",", ".")) * 1_000

    if price is None:
        m = list(re.finditer(r"\b(\d{1,3})k\b", text))
        if m:
            price = float(m[-1].group(1)) * 1_000

    if price is None:
        m = list(re.finditer(r"\b(\d{2,3}(?:\.\d{3})+|\d{4,})\b", text))
        if m:
            price = float(m[-1].group(1).replace(".", ""))

    if price is None:
        return None

    if re.search(r"\btotal\b", text):
        qty_match = re.search(
            r"(?:untuk|utk|for)\s+(\d+(?:[.,]\d+)?)\s*"
            r"(?:kg|ton|batang|meter|pcs|pieces|unit|lembar|dus|karung|sak|liter|roll|gulung|buah|pack|box|kardus|m2|m3)?\b",
            text,
        )
        if qty_match:
            qty = float(qty_match.group(1).replace(",", "."))
            if qty > 0:
                price = price / qty

    return price


PAYMENT_TERM_PATTERN = re.compile(r"\btempo\b|\bDP\b|\bdown payment\b|\bcicil", re.IGNORECASE)
HEDGING_PATTERN = re.compile(r"insyaallah|kayaknya|mungkin|kalau bisa|coba ya|semoga", re.IGNORECASE)