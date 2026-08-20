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

    return TriageResponse(**parsed, raw_model_output=model_reply)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None}
