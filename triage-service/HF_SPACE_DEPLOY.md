# Hubungkan Gemma di Hugging Face Space ke Pasokin

Alur: backend Pasokin di Vercel memanggil `POST /triage` pada Docker Space. Space memuat `google/gemma-2b-it` dengan `adapter_v2`. Akun Hugging Face boleh berbeda dari akun Vercel. Tidak perlu mengunggah base model yang telah diunduh ke laptop.

## 1. Siapkan paket Space

Jalankan PowerShell dari root repo Pasokin, pilih folder baru **di luar repo**:

```powershell
.\triage-service\prepare-hf-space.ps1 -OutputDir "$env:USERPROFILE\Pasokin-HF-Space"
```

Folder hasil berisi `README.md`, `Dockerfile`, `requirements.txt`, `main.py`, dan dua berkas di `adapter/` dari `adapter_v2`. Tidak ada base model, token, atau `.env` di paket. Jangan masukkan token ke berkas paket.

## 2. Buat Docker Space

1. Pastikan akun Hugging Face yang akan memiliki Space sudah mendapat akses ke model gated [`google/gemma-2b-it`](https://huggingface.co/google/gemma-2b-it).
2. Di Hugging Face, buat Space baru dengan SDK **Docker**. Untuk akun PRO, pilih visibilitas **Protected** agar kode dan adapter hanya terlihat oleh pemilik/kolaborator, sementara endpoint tetap dapat diakses oleh backend Vercel melalui URL Space. Pilih **CPU Basic** saat membuat Space agar belum ada biaya GPU; service dapat gagal memuat model sampai GPU dan dua secret di bawah dikonfigurasi.
3. Unggah isi folder paket ke root repo Space. `adapter_config.json` dan `adapter_model.safetensors` harus tetap berada di folder `adapter/`.
4. Pada **Settings → Variables and secrets**, buat dua **Secrets**:
   - `HF_TOKEN`: token Hugging Face dengan izin baca untuk model Gemma, milik akun yang telah mendapat akses.
   - `TRIAGE_SHARED_TOKEN`: nilai acak panjang yang dibuat sendiri. Simpan nilainya untuk konfigurasi Vercel.

5. Pada **Settings → Hardware**, pilih GPU dengan memori yang cukup, misalnya T4 16 GB, setelah paket dan secret siap. GPU Space berbayar selama berjalan; periksa harga dan billing sebelum mengaktifkannya.

Jangan membuat `TRIAGE_SHARED_TOKEN` sebagai Variable publik. Dockerfile mengharuskan token ini tersedia sebelum model dimuat. Space mengunduh base model pada startup pertama, sehingga waktu boot awal dapat lebih lama. `GET /health` akan mengembalikan `model_loaded: true` setelah siap.

## 3. Hubungkan backend Vercel

Pada project Vercel Pasokin, buka **Settings → Environment Variables** dan set untuk environment yang digunakan:

```text
TRIAGE_SERVICE_URL=https://<owner>-<space>.hf.space
TRIAGE_SHARED_TOKEN=<nilai-yang-sama-dengan-secret-Space>
```

Gunakan URL publik langsung dari halaman Space, tanpa `/triage` di akhir. Simpan lalu redeploy backend agar env baru terbaca. Jangan memakai awalan `VITE_` untuk kedua variabel ini. `HF_TOKEN` hanya diperlukan di Space, bukan di browser atau backend Vercel.

Backend akan mengirim `X-Pasokin-Triage-Token` pada permintaan ke Space. Tanpa token yang cocok, Space membalas 401 dan Pasokin menandai balasan supplier untuk review manual. Jika Space masih memuat model atau tidak tersedia, alur review manual tetap berlaku. Pemrosesan di Vercel juga bergantung pada batas durasi fungsi yang berlaku untuk project; uji satu balasan supplier setelah deploy.

## 4. Verifikasi

1. Periksa `/health` dan tunggu `model_loaded: true`.
2. Uji satu balasan supplier melalui Pasokin dalam mode demo atau live. Pastikan hasil triase tampil; jika gagal, periksa log backend dan Space tanpa menyalin token ke chat atau log.
3. Setelah uji selesai, pause Space jika tidak digunakan agar GPU tidak terus menimbulkan biaya.

Konfigurasi Docker Compose lokal tetap dapat berjalan tanpa `TRIAGE_SHARED_TOKEN` dan tanpa GPU Space. Untuk layanan publik, jangan menonaktifkan `TRIAGE_REQUIRE_AUTH=true` pada Dockerfile Space.
