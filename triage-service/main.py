"""
Pasokin Triage Service
-----------------------
Layanan inference kecil yang meng-host model Gemma 2B + LoRA adapter
hasil fine-tuning (lihat /model-tuning/pasokin_finetune_colab.ipynb).

Mengklasifikasikan balasan WhatsApp supplier, termasuk balasan simulasi
saat mode demo. Gemini di backend Node.js hanya mem-parsing RFQ buyer.

Jalankan lokal:
    uvicorn main:app --host 0.0.0.0 --port 8001

Endpoint:
    POST /triage
    body: {"text_input": "Konteks RFQ: ... Balasan Supplier: ..."}
    response: {"classification": "...", "ai_summary": "...", "ai_extracted": {...}}
"""

import json
import logging
import os
import re
import secrets
from datetime import datetime

import torch
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pasokin-triage")

# Load environment variables from .env file if it exists
load_dotenv()

BASE_MODEL_ID = os.environ.get("BASE_MODEL_ID", "google/gemma-2b-it")
ADAPTER_PATH = os.environ.get("ADAPTER_PATH", "./adapter_v2")
USE_4BIT = os.environ.get("USE_4BIT", "auto")  # "auto" | "true" | "false"

SYSTEM_INSTRUCTION = (
    "Kamu adalah asisten triase balasan supplier untuk sistem procurement Pasokin. "
    "Baca konteks RFQ dan balasan supplier, lalu keluarkan HANYA JSON valid dengan field: "
    "classification (confirmed / needs_manual_review), ai_summary (ringkasan singkat), "
    "dan ai_extracted (qty, price, lead_time_days)."
)

PROMPT_TEMPLATE = (
    "<start_of_turn>user\n{system}\n\n{input_text}<end_of_turn>\n<start_of_turn>model\n"
)


class TriageRequest(BaseModel):
    text_input: str


class TriageResponse(BaseModel):
    classification: str
    ai_summary: str
    ai_extracted: dict
    raw_model_output: str | None = None  # buat debugging kalau parsing gagal


app = FastAPI(title="Pasokin Triage Service")

_model = None
_tokenizer = None


def _resolve_use_4bit() -> bool:
    if USE_4BIT == "true":
        return True
    if USE_4BIT == "false":
        return False
    return torch.cuda.is_available()


@app.on_event("startup")
def load_model():
    global _model, _tokenizer

    if os.environ.get("TRIAGE_REQUIRE_AUTH", "false").lower() == "true" and not os.environ.get("TRIAGE_SHARED_TOKEN"):
        raise RuntimeError("TRIAGE_SHARED_TOKEN wajib diisi saat TRIAGE_REQUIRE_AUTH=true")

    cuda_available = torch.cuda.is_available()
    use_4bit = _resolve_use_4bit()

    logger.info(f"CUDA available: {cuda_available} | 4-bit quantization: {use_4bit}")
    if not cuda_available:
        logger.warning(
            "Tidak ada GPU terdeteksi. Gemma 2B akan berjalan di CPU dan bisa sangat "
            "lambat (puluhan detik per request). Untuk demo live, jalankan service ini "
            "di mesin dengan GPU, atau naikkan timeout di sisi backend Node.js."
        )

    HF_TOKEN = os.environ.get("HF_TOKEN")
    _tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, token=HF_TOKEN)

    model_kwargs = {"device_map": "auto" if cuda_available else None}
    if use_4bit:
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.bfloat16,
        )
    elif cuda_available:
        model_kwargs["torch_dtype"] = torch.bfloat16

    base_model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_ID, token=HF_TOKEN, **model_kwargs)
    _model = PeftModel.from_pretrained(base_model, ADAPTER_PATH)
    _model.eval()

    logger.info("Model + adapter berhasil dimuat.")


def _extract_json(raw_text: str) -> dict:
    """Ekstrak JSON dengan menghitung bracket agar kebal dari trailing garbage."""
    start_idx = raw_text.find('{')
    if start_idx == -1:
        raise ValueError("Tidak ada objek JSON ditemukan di output model.")

    brace_count = 0
    end_idx = -1
    for i in range(start_idx, len(raw_text)):
        if raw_text[i] == '{':
            brace_count += 1
        elif raw_text[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = i
                break

    if end_idx == -1:
        raise ValueError("Struktur JSON tidak tertutup dengan benar.")

    json_str = raw_text[start_idx:end_idx+1]
    return json.loads(json_str)


ID_MONTHS = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
    "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12,
}

# Cycle 3 fix #1: abbreviasi bulan ("okt", "nov", dst.) -- tanpa ini,
# "kirim 20 Okt" tidak match sama sekali dan lead_time_days jatuh ke None,
# yang bikin guardrail salah paham sebagai "tidak ada tanggal kirim" (triage_016).
ID_MONTH_ABBR = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "agu": 8, "ags": 8, "sep": 9, "okt": 10, "nov": 11, "des": 12,
}
ID_MONTHS_LOOKUP = {**ID_MONTHS, **ID_MONTH_ABBR}
# Diurutkan terpanjang dulu supaya "september" dicoba sebelum "sep" -- kalau
# dibalik, "sep" bisa nyangkut duluan di tengah kata "september" dan salah parse.
_MONTH_PATTERN = "|".join(sorted(ID_MONTHS_LOOKUP.keys(), key=len, reverse=True))

ID_DAYNAMES = {
    "senin": 0, "selasa": 1, "rabu": 2, "kamis": 3, "jumat": 4, "sabtu": 5, "minggu": 6,
}

# Cycle 2/3: aturan tambahan T4/T5 yang membaca teks balasan mentah langsung
# (bukan hasil ekstraksi model) -- lihat cycle.md Cycle 2c/3c untuk analisis
# kenapa versi yang baca ai_extracted tidak efektif.
PAYMENT_TERM_PATTERN = re.compile(r"\btempo\b|\bDP\b|\bdown payment\b|\bcicil", re.IGNORECASE)
HEDGING_PATTERN = re.compile(r"insyaallah|kayaknya|mungkin|semoga", re.IGNORECASE)


def _parse_id_date(text: str):
    """'12 Oktober 2026' -> datetime(2026, 10, 12). None kalau tidak match."""
    m = re.search(r"(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})", text or "")
    if not m:
        return None
    day, month_name, year = m.groups()
    month = ID_MONTHS.get(month_name.lower())
    if not month:
        return None
    try:
        return datetime(int(year), month, int(day))
    except ValueError:
        return None


def _extract_rfq_context(text_input: str) -> dict:
    """Ambil angka acuan RFQ (harga target, qty diminta, sisa hari sampai target
    kirim, dan tanggal RFQ dikirim sebagai anchor) dari text_input, biar guardrail
    punya sesuatu buat dibandingkan. Menangani dua format text_input yang beredar:
      - lama:  '... target harga Rp <x>, target pengiriman maksimal <n> hari ...'
      - baru:  '... Rp<x>. Tanggal RFQ dikirim: <tgl>. Target kirim: <tgl>. ...'
    """
    rfq_part = text_input.split("Balasan Supplier:")[0]

    price_match = re.search(r"Rp\.?\s*([\d.,]+)", rfq_part)
    rfq_price = None
    if price_match:
        try:
            rfq_price = float(price_match.group(1).replace(".", "").replace(",", "."))
        except ValueError:
            rfq_price = None

    unit_words = r"kg|ton|batang|meter|pcs|pieces|unit|lembar|dus|karung|sak|liter|roll|gulung|buah|pack|box|kardus|m2|m3"
    qty_match = re.search(rf"(\d+(?:[.,]\d+)?)\s*(?:{unit_words})\b", rfq_part, re.IGNORECASE)
    rfq_qty = float(qty_match.group(1).replace(",", ".")) if qty_match else None

    max_lead_days = None
    dispatched_at = None
    explicit_days = re.search(r"maksimal\s+(\d+)\s+hari", rfq_part, re.IGNORECASE)
    if explicit_days:
        max_lead_days = int(explicit_days.group(1))
    else:
        sent_match = re.search(r"Tanggal RFQ dikirim:\s*([^.]+)\.", rfq_part, re.IGNORECASE)
        target_match = re.search(r"Target kirim:\s*([^.]+)\.", rfq_part, re.IGNORECASE)
        if sent_match:
            dispatched_at = _parse_id_date(sent_match.group(1))
        if sent_match and target_match:
            d2 = _parse_id_date(target_match.group(1))
            if dispatched_at and d2:
                max_lead_days = (d2 - dispatched_at).days

    return {
        "rfq_price": rfq_price, "rfq_qty": rfq_qty,
        "max_lead_days": max_lead_days, "dispatched_at": dispatched_at,
    }


def _extract_reply_text(text_input: str) -> str:
    parts = text_input.split("Balasan Supplier:", 1)
    return parts[1].strip() if len(parts) > 1 else text_input


def _resolve_lead_time_from_reply(reply_text: str, dispatched_at: datetime):
    """Hitung lead_time_days SECARA DETERMINISTIK dari teks balasan mentah,
    dipakai buat MENIMPA hasil ekstraksi model. Return None kalau tidak ada
    penanda jadwal kirim sama sekali di balasan (bukan berarti 0).

    Cycle 3 fix #2: idiom "minggu ini"/"minggu depan" dicek SEBELUM day-name
    loop -- kalau dibalik, kata "minggu" di idiom itu ketangkep duluan sebagai
    nama hari (Minggu/Sunday) dan menghasilkan angka yang salah (lihat
    triage_022 di cycle.md Cycle 3c).
    """
    text = reply_text.lower()
    anchor = dispatched_at

    if re.search(r"\bbesok\b|\bbsk\b", text):
        return 1
    if re.search(r"\blusa\b", text):
        return 2
    if re.search(r"\bhari ini\b|\bhr ini\b", text):
        return 0

    # Cycle 3 fix #1: pola bulan sekarang termasuk abbreviasi (okt, nov, des, ...)
    m = re.search(rf"(?:tanggal|tgl\.?)?\s*(\d{{1,2}})\s*({_MONTH_PATTERN})\b", text)
    if m:
        day, month, year = int(m.group(1)), ID_MONTHS_LOOKUP[m.group(2)], anchor.year
        try:
            target = datetime(year, month, day)
        except ValueError:
            return None
        if target < anchor:
            target = datetime(year + 1, month, day)
        return (target - anchor).days

    m = re.search(r"(?:tanggal|tgl\.?)\s*(\d{1,2})\b", text)
    if m:
        day = int(m.group(1))
        month, year = anchor.month, anchor.year
        if day < anchor.day:
            month += 1
            if month > 12:
                month, year = 1, year + 1
        try:
            target = datetime(year, month, day)
        except ValueError:
            month += 1
            if month > 12:
                month, year = 1, year + 1
            try:
                target = datetime(year, month, day)
            except ValueError:
                return None
        return (target - anchor).days

    # Cycle 3 fix #2: idiom minggu duluan, sebelum day-name loop di bawah
    if re.search(r"minggu ini", text):
        return (6 - anchor.weekday()) % 7
    if re.search(r"minggu depan", text):
        return 7

    for name, weekday in ID_DAYNAMES.items():
        if re.search(rf"\b{name}\b", text):
            days_ahead = (weekday - anchor.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            if re.search(rf"\b{name}\s+depan\b", text):
                days_ahead += 7
            return days_ahead

    m = re.search(r"(\d+)\s*hari\s*lagi", text)
    if m:
        return int(m.group(1))

    return None


def _reply_has_any_number(reply_text: str) -> bool:
    return bool(re.search(r"\d", reply_text))


def _extract_reply_price(reply_text: str):
    """Ekstrak harga langsung dari teks balasan, independen dari ai_extracted.price.

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


def _apply_triage_guardrail(parsed: dict, text_input: str) -> dict:
    """Fase II T1/T4/T5 + Cycle 2/3 revisi: aturan membaca teks balasan MENTAH,
    bukan cuma hasil ekstraksi model -- karena model kadang ngarang angka dari
    konteks RFQ (triage_031) atau nyalin/salah baca harga dari balasan
    (triage_040, 042, 043). Cuma pernah mengetatkan confirmed ->
    needs_manual_review, tidak pernah sebaliknya -- jadi tidak menambah
    missed-confirmation rate secara struktural (meski extraction error masih
    bisa menyebabkan itu secara tidak langsung, lihat cycle.md Cycle 3c).
    """
    if parsed.get("classification") != "confirmed":
        return parsed

    extracted = parsed.get("ai_extracted") or {}
    ctx = _extract_rfq_context(text_input)
    reply_text = _extract_reply_text(text_input)

    if ctx["dispatched_at"] is not None:
        computed_lead_time = _resolve_lead_time_from_reply(reply_text, ctx["dispatched_at"])
        extracted["lead_time_days"] = computed_lead_time
        parsed["ai_extracted"] = extracted
    else:
        computed_lead_time = extracted.get("lead_time_days")

    qty = extracted.get("qty")
    reason = None

    if not _reply_has_any_number(reply_text):
        reason = "balasan tidak mengandung angka sama sekali"
    else:
        reply_price = _extract_reply_price(reply_text)
        if reply_price is not None and ctx["rfq_price"] is not None and reply_price > ctx["rfq_price"]:
            reason = f"harga di balasan ({reply_price}) di atas harga RFQ ({ctx['rfq_price']})"
        elif qty is None:
            reason = "qty tidak disebutkan secara eksplisit di balasan"
        elif computed_lead_time is None:
            reason = "tidak ada tanggal/estimasi pengiriman eksplisit di balasan"
        elif ctx["max_lead_days"] is not None and computed_lead_time > ctx["max_lead_days"]:
            reason = f"lead time ({computed_lead_time} hari) melewati target ({ctx['max_lead_days']} hari)"
        elif PAYMENT_TERM_PATTERN.search(reply_text):
            reason = "ada syarat pembayaran (tempo/DP/cicilan) di luar alur pembayaran standar"
        elif HEDGING_PATTERN.search(reply_text):
            reason = "bahasa tidak pasti (insyaallah/mungkin/dst.) di balasan"

    if reason:
        parsed["classification"] = "needs_manual_review"
        original_summary = parsed.get("ai_summary", "") or ""
        parsed["ai_summary"] = f"{original_summary} [Guardrail: {reason}]".strip()

    return parsed


@app.post("/triage", response_model=TriageResponse)
def triage(req: TriageRequest, x_pasokin_triage_token: str | None = Header(default=None)):
    expected_token = os.environ.get("TRIAGE_SHARED_TOKEN")
    if expected_token and (not x_pasokin_triage_token or not secrets.compare_digest(x_pasokin_triage_token, expected_token)):
        raise HTTPException(status_code=401, detail="Akses triage ditolak.")
    if _model is None or _tokenizer is None:
        raise HTTPException(status_code=503, detail="Model belum selesai dimuat.")

    prompt = PROMPT_TEMPLATE.format(system=SYSTEM_INSTRUCTION, input_text=req.text_input)
    inputs = _tokenizer(prompt, return_tensors="pt").to(_model.device)

    with torch.no_grad():
        output_ids = _model.generate(
            **inputs,
            max_new_tokens=200,
            do_sample=False,
        )

    decoded = _tokenizer.decode(output_ids[0], skip_special_tokens=True)
    model_reply = decoded.split("model\n")[-1].strip()

    try:
        parsed = _extract_json(model_reply)
    except (ValueError, json.JSONDecodeError) as e:
        logger.error(f"Gagal parsing output model: {e}\nRaw output: {model_reply}")
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Model tidak menghasilkan JSON valid, perlu tinjauan manual.",
                "raw_model_output": model_reply,
            },
        )

    required_fields = {"classification", "ai_summary", "ai_extracted"}
    if not required_fields.issubset(parsed.keys()):
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Output model tidak lengkap, field wajib: {required_fields}",
                "raw_model_output": model_reply,
            },
        )

    parsed = _apply_triage_guardrail(parsed, req.text_input)

    return TriageResponse(**parsed, raw_model_output=model_reply)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None}
