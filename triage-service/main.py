"""
Pasokin Triage Service
-----------------------
Layanan inference kecil yang meng-host model Gemma 2B + LoRA adapter
hasil fine-tuning (lihat /model-tuning/pasokin_finetune_colab.ipynb).

Menggantikan panggilan Gemini API khusus untuk tugas triase balasan
WhatsApp supplier. Komponen AI lain (parsing kebutuhan, reasoning
alokasi, draft RFQ) tetap pakai Gemini di backend Node.js.

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
from datetime import datetime

import torch
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pasokin-triage")

# Load environment variables from .env file if it exists
load_dotenv()

BASE_MODEL_ID = os.environ.get("BASE_MODEL_ID", "google/gemma-2b-it")
ADAPTER_PATH = os.environ.get("ADAPTER_PATH", "./adapter")
USE_4BIT = os.environ.get("USE_4BIT", "auto")  # "auto" | "true" | "false"
DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() == "true"

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

    if DEMO_MODE:
        logger.warning(
            "DEMO_MODE=true: melewati loading model Gemma 2B + adapter. "
            "Backend Node.js dalam DEMO_MODE tidak pernah memanggil /triage, "
            "jadi service ini cukup tetap hidup tanpa model untuk keperluan demo."
        )
        return

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
    kirim) dari text_input, biar guardrail punya sesuatu buat dibandingkan.
    Menangani dua format text_input yang beredar:
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
    explicit_days = re.search(r"maksimal\s+(\d+)\s+hari", rfq_part, re.IGNORECASE)
    if explicit_days:
        max_lead_days = int(explicit_days.group(1))
    else:
        sent_match = re.search(r"Tanggal RFQ dikirim:\s*([^.]+)\.", rfq_part, re.IGNORECASE)
        target_match = re.search(r"Target kirim:\s*([^.]+)\.", rfq_part, re.IGNORECASE)
        if sent_match and target_match:
            d1 = _parse_id_date(sent_match.group(1))
            d2 = _parse_id_date(target_match.group(1))
            if d1 and d2:
                max_lead_days = (d2 - d1).days

    return {"rfq_price": rfq_price, "rfq_qty": rfq_qty, "max_lead_days": max_lead_days}


def _apply_triage_guardrail(parsed: dict, text_input: str) -> dict:
    """Fase II T1/T4/T5: guardrail deterministik SETELAH model, targetnya
    40.7% False-Confirmed rate di baseline. Cuma pernah mengetatkan
    confirmed -> needs_manual_review, tidak pernah ke arah sebaliknya --
    jadi tidak menambah missed-confirmation rate.

    Aturan (konsisten dengan 46 kasus eval Triage yang sudah direview tim):
    - Tidak ada angka (qty/harga/lead_time) yang berhasil diekstrak sama sekali
      -> jangan pernah percaya "confirmed" tanpa bukti (T5).
    - Harga supplier di atas harga target RFQ -> review (T1).
    - Qty tidak disebutkan eksplisit -> review (partial qty tetap boleh,
      asal ADA angkanya -- keputusan tim soal partial-qty confirmed).
    - Tidak ada lead time/tanggal kirim eksplisit -> review (T4).
    - Lead time yang disebutkan melewati target kirim -> review (T4).
    """
    if parsed.get("classification") != "confirmed":
        return parsed

    extracted = parsed.get("ai_extracted") or {}
    qty = extracted.get("qty")
    price = extracted.get("price")
    lead_time_days = extracted.get("lead_time_days")

    ctx = _extract_rfq_context(text_input)
    reason = None

    if qty is None and price is None and lead_time_days is None:
        reason = "tidak ada angka (qty/harga/lead time) yang berhasil diekstrak dari balasan"
    elif price is not None and ctx["rfq_price"] is not None and price > ctx["rfq_price"]:
        reason = f"harga supplier ({price}) di atas harga RFQ ({ctx['rfq_price']})"
    elif qty is None:
        reason = "qty tidak disebutkan secara eksplisit di balasan"
    elif lead_time_days is None:
        reason = "tidak ada tanggal/estimasi pengiriman eksplisit di balasan"
    elif ctx["max_lead_days"] is not None and lead_time_days > ctx["max_lead_days"]:
        reason = f"lead time ({lead_time_days} hari) melewati target ({ctx['max_lead_days']} hari)"

    if reason:
        parsed["classification"] = "needs_manual_review"
        original_summary = parsed.get("ai_summary", "") or ""
        parsed["ai_summary"] = f"{original_summary} [Guardrail: {reason}]".strip()

    return parsed


@app.post("/triage", response_model=TriageResponse)
def triage(req: TriageRequest):
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