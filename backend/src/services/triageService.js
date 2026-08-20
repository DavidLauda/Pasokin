const axios = require('axios');
const configService = require('./configService');

const TRIAGE_SERVICE_URL = process.env.TRIAGE_SERVICE_URL || 'http://localhost:8001';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Sama persis dengan heuristik demo mode yang lama di geminiService.js,
// dipertahankan supaya DEMO_MODE=true masih jalan tanpa perlu GPU/model loaded.
async function classifySupplierReply(requirementSnapshot, allocationSnapshot, replyText) {
    if (configService.isDemoMode()) {
        await sleep(2000);
        if (replyText.toLowerCase().includes('bisa') || replyText.toLowerCase().includes('oke') || replyText.toLowerCase().includes('siap')) {
            return {
                classification: "confirmed",
                ai_summary: "Supplier menyetujui kuantitas, harga, dan jadwal sesuai permintaan.",
                ai_extracted: {
                    qty: allocationSnapshot.qty,
                    price: allocationSnapshot.price,
                    lead_time_days: allocationSnapshot.lead_time_days
                }
            };
        } else {
            return {
                classification: "needs_manual_review",
                ai_summary: "Supplier tampaknya melakukan negosiasi ulang atau bertanya.",
                ai_extracted: null
            };
        }
    }

    const textInput = `Konteks RFQ: Material ${requirementSnapshot.materialName}, ` +
        `kuantitas diminta ${allocationSnapshot.qty} ${requirementSnapshot.unit}, ` +
        `target harga Rp ${allocationSnapshot.price}, ` +
        `target pengiriman maksimal ${allocationSnapshot.lead_time_days} hari. ` +
        `Balasan Supplier: ${replyText}`;

    try {
        const response = await axios.post(
            `${TRIAGE_SERVICE_URL}/triage`,
            { text_input: textInput },
            { timeout: 30000 }
        );

        const { classification, ai_summary, ai_extracted } = response.data;

        return {
            classification: classification === "confirmed" ? "confirmed" : "needs_manual_review",
            ai_summary,
            ai_extracted
        };
    } catch (e) {
        console.error("Triage service gagal atau tidak dapat dihubungi", e.message);
        return {
            classification: "needs_manual_review",
            ai_summary: "Terjadi error saat analisis AI (triage service). Butuh review manual.",
            ai_extracted: null
        };
    }
}

module.exports = { classifySupplierReply };
