# Orang B: Konfirmasi Harga Manual

Implementasi ini menggunakan kontrak bersama tanpa mengubah `schema.sql`,
`procurementsStore.js`, router RFQ, atau dashboard Orang A.

## Integrasi

- Dua mount di `backend/src/app.js` adalah satu-satunya perubahan backend pada
  file bersama. Middleware `/api/wa/webhook` untuk balasan summary harus tetap
  dipasang **sebelum** router WhatsApp lama agar balasan summary tidak masuk
  classifier negosiasi.
- UI terpisah di `/manual-confirmation.html`; buka dengan
  `?procurement_id=<uuid>` untuk langsung membuka pengadaan dari dashboard A.
  Halaman ini tidak mengubah `App.jsx` yang sedang dikerjakan A.
- Pesan summary selalu memakai `procurements.reference_code` yang sudah ada.
  Balasan masuk harus memuat kode tersebut dan berasal dari nomor supplier yang
  sama dengan `negotiated_supplier_id`.
- Query pesan selalu memakai tabel `procurement_messages` dan filter
  `message_type = 'summary_confirmation'`. `classified_as` selalu `null`.

## Data dummy

Setelah skema bersama Orang A tersedia di Supabase, jalankan
`node backend/supabase/seed-manual-confirmation.js` dari root repo. Script
membuat dua pengadaan dengan status berbeda: `PSK-TEST` perlu review manual
(memakai `supplier_uuid` yang sudah ada) dan `PSK-DM02` baru diparsing. Script
aman dijalankan ulang. Aktifkan DEMO_MODE untuk menguji kirim WhatsApp tanpa
gateway live.

Skema hasil integrasi Orang A mempertahankan `suppliers.id` bertipe text untuk
alur lama dan menambah `suppliers.supplier_uuid` untuk foreign key kontrak.
Query Orang B memakai `supplier_uuid` ketika membaca supplier atau menulis
`procurement_messages.supplier_id`. Pastikan migrasi skema bersama sudah
diterapkan di Supabase sebelum menjalankan seed.

## API

- `GET /api/manual-confirmations` — daftar yang perlu diproses.
- `GET /api/manual-confirmations/:id` — detail dan inbox summary.
- `POST /api/manual-confirmations/:id/summary` — body `price`, `unit`, `quantity`.
- `POST /api/manual-confirmations/:id/resolve` — body `decision: confirm | reject`.

Setelah reject, status kembali `triaging`, kolom harga/unit/jumlah dikosongkan,
dan halaman mengenali siklus summary sebelumnya untuk membuka ulang form.
