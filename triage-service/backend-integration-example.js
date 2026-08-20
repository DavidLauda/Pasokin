// Contoh integrasi di backend Express — ganti bagian yang sebelumnya
// manggil Gemini API buat triase balasan WhatsApp supplier.
//
// Taruh ini di modul yang menangani balasan supplier masuk
// (dekat listener Baileys atau di dalam /api/dispatch-wa).

const axios = require('axios');

const TRIAGE_SERVICE_URL = process.env.TRIAGE_SERVICE_URL || 'http://triage-service:8001';

/**
 * Kirim konteks RFQ + balasan supplier ke Gemma triage service.
 * Menggantikan panggilan Gemini khusus untuk tugas ini.
 *
 * @param {string} rfqContext - ringkasan RFQ yang dikirim ke supplier
 * @param {string} supplierReply - teks balasan WhatsApp dari supplier
 * @returns {Promise<{classification: string, ai_summary: string, ai_extracted: object}>}
 */
async function triageSupplierReply(rfqContext, supplierReply) {
    const textInput = `Konteks RFQ: ${rfqContext}. Balasan Supplier: ${supplierReply}`;

    try {
        const response = await axios.post(
            `${TRIAGE_SERVICE_URL}/triage`,
            { text_input: textInput },
            { timeout: 30000 } // Gemma di CPU bisa lambat, naikkan kalau perlu
        );
        return response.data;
    } catch (error) {
        if (error.response?.status === 422) {
            // Model gagal menghasilkan JSON valid — fallback ke tinjauan manual
            console.warn('Triage service gagal parsing, dialihkan ke manual review:', error.response.data);
            return {
                classification: 'needs_manual_review',
                ai_summary: 'Model triase gagal memproses balasan ini secara otomatis.',
                ai_extracted: {},
            };
        }
        // Timeout atau service down — jangan biarkan seluruh alur dispatch gagal
        console.error('Triage service tidak dapat dihubungi:', error.message);
        return {
            classification: 'needs_manual_review',
            ai_summary: 'Triage service tidak tersedia, balasan perlu ditinjau manual.',
            ai_extracted: {},
        };
    }
}

module.exports = { triageSupplierReply };
