# Model Fine-Tuning — Pasokin (Kepatuhan Kompetisi)

## Ringkasan

Folder ini berisi bukti fine-tuning model yang dijalankan sebagai bukti kepatuhan terhadap syarat AIC COMPFEST 18: *"Model wajib di fine tune sesuai dengan inovasi fitur per tim"*.

Model yang di-fine-tune: **Gemma 2B (`google/gemma-2b-it`)** untuk tugas triase balasan WhatsApp supplier — mengklasifikasikan balasan supplier menjadi `confirmed` atau `needs_manual_review`, sekaligus mengekstrak `price`, `qty`, dan `lead_time_days` dalam format JSON terstruktur.

## Kenapa Bukan Fine-Tuning Gemini?

Google resmi men-deprecate fine-tuning lewat Gemini API/AI Studio sejak Mei 2025. Fine-tuning Gemini sekarang hanya tersedia lewat Vertex AI / Gemini Enterprise Agent Platform, yang mewajibkan project GCP dengan billing aktif (kartu kredit), meski secara teknis tidak langsung ditagih.

Tim sempat mengeksplorasi jalur ini (`tune.js`, diarsipkan di bawah), tapi kartu kredit menjadi blocker: Google Cloud Free Trial tetap mewajibkan verifikasi kartu kredit, dan jalur student/edu grant tidak realistis untuk timeline kompetisi (harus lewat dosen, nilai kecil).

Tim pivot ke fine-tuning model open-source (Gemma 2B) via Google Colab, yang sepenuhnya gratis dan menghasilkan bobot model asli, bukan simulasi.

## Isi Folder

| File | Deskripsi |
|---|---|
| `pasokin_finetune_colab.ipynb` | Notebook fine-tuning lengkap: load dataset, format prompt, load Gemma 2B (4-bit), setup LoRA, training, simpan adapter |
| `dataset_triage.jsonl` | Dataset training (136 baris, kolom `text_input` dan `output`) |
| `pasokin-triage-gemma-final/` | LoRA adapter weights hasil training (`adapter_model.safetensors`, `adapter_config.json`, tokenizer files) |
| `tune.js` *(diarsipkan)* | Percobaan awal fine-tuning lewat Gemini Tuning API — ditinggalkan karena endpoint ini tidak lagi didukung untuk akses via API key biasa (lihat penjelasan di atas) |

## Detail Training

- **Base model:** `google/gemma-2b-it`, quantized 4-bit (NF4) untuk muat di GPU T4 gratis Colab
- **Metode:** LoRA (`r=8`, `alpha=16`, `dropout=0.05`, target modules `q_proj`/`k_proj`/`v_proj`/`o_proj`)
- **Dataset:** 136 baris data triase sintetik, mencakup kasus harga naik, penolakan MOQ, syarat pembayaran, pertanyaan spesifikasi, partial stock, biaya tambahan, produk alternatif
- **Hasil akhir:** val loss 1.207, token accuracy 82.4%

Proses training melalui 3 iterasi bertahap (46 → 75 → 136 baris) seiring ekspansi dataset, termasuk satu bug LoRA adapter menumpuk akibat training berulang tanpa restart runtime, yang diperbaiki dengan restart dan training ulang dari nol. Detail lengkap ada di proposal bab Metodologi Pengembangan.

## Status Penggunaan

Model hasil fine-tuning ini menjadi bukti kelayakan teknis (proof of feasibility) untuk komponen triase. Sistem production Pasokin saat ini tetap menggunakan Gemini API (in-context learning) untuk parsing kebutuhan, reasoning alokasi, dan penyusunan pesan RFQ, karena membutuhkan generalisasi bahasa yang lebih luas dibanding model kecil hasil fine-tuning terbatas. Migrasi penuh ke model Gemma untuk triase di jalur production menjadi bagian dari rencana pengembangan lanjutan, setelah dataset training diperluas dengan data interaksi supplier riil.