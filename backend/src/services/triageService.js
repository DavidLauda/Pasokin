const axios = require('axios');

const TRIAGE_SERVICE_URL = process.env.TRIAGE_SERVICE_URL || 'http://localhost:8001';

// 'D Bulan YYYY' bahasa Indonesia, sama persis format yang dipakai di
// data training/eval baru ("12 Oktober 2026") -- HARUS konsisten dengan
// format yang dibaca di triage-service/main.py.
// timeZone eksplisit 'Asia/Jakarta' -- tanpa ini, kalau server jalan di
// timezone lain (mis. UTC default di Docker), tanggal deket tengah malam
// WIB bisa geser mundur 1 hari waktu dikonversi.
function formatIndoDate(dateInput) {
    if (!dateInput) return null;
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
    });
}

// dispatchedAt: timestamp RFQ dikirim ke supplier (dispatchLog.dispatched_at).
// WAJIB di-pass supaya text_input yang dikirim ke model PERSIS SAMA formatnya
// dengan data training baru ("Tanggal RFQ dikirim: ... Target kirim: ...") --
// kalau nggak, retrain jadi sia-sia karena train/serve skew.
async function classifySupplierReply(requirementSnapshot, allocationSnapshot, replyText, dispatchedAt) {
    // Format baru (konsisten dengan data training hasil retrain T2/T3):
    // "Konteks RFQ: <material> <qty> <unit> Rp<harga>. Tanggal RFQ dikirim: <tgl>. Target kirim: <tgl>. Balasan Supplier: ..."
    const sentDateStr = formatIndoDate(dispatchedAt);
    const targetDateStr = formatIndoDate(requirementSnapshot.targetDeliveryDate);

    const textInput = (sentDateStr && targetDateStr)
        ? `Konteks RFQ: ${requirementSnapshot.materialName} ${allocationSnapshot.qty} ${requirementSnapshot.unit} Rp${allocationSnapshot.price}. ` +
          `Tanggal RFQ dikirim: ${sentDateStr}. Target kirim: ${targetDateStr}. ` +
          `Balasan Supplier: ${replyText}`
        // Fallback ke format lama kalau dispatchedAt/targetDeliveryDate nggak tersedia.
        : `Konteks RFQ: Material ${requirementSnapshot.materialName}, ` +
          `kuantitas diminta ${allocationSnapshot.qty} ${requirementSnapshot.unit}, ` +
          `target harga Rp ${allocationSnapshot.price}, ` +
          `target pengiriman maksimal ${allocationSnapshot.lead_time_days} hari. ` +
          `Balasan Supplier: ${replyText}`;

    try {
        // Mode demo hanya memalsukan transport WhatsApp; triase tetap memakai Gemma.
        const response = await axios.post(
            `${TRIAGE_SERVICE_URL}/triage`,
            { text_input: textInput },
            { timeout: 90000 }
        );

        const { classification, ai_summary, ai_extracted } = response.data;

        return {
            classification: classification === "confirmed" ? "confirmed" : "needs_manual_review",
            ai_summary,
            ai_extracted
        };
    } catch (e) {
        console.error("Triage service Gemma gagal atau tidak dapat dihubungi", e.message);
        return {
            classification: "needs_manual_review",
            ai_summary: "Gemma tidak dapat menganalisis balasan supplier. Butuh review manual.",
            ai_extracted: null
        };
    }
}

module.exports = { classifySupplierReply };