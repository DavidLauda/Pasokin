const axios = require('axios');

const TRIAGE_SERVICE_URL = process.env.TRIAGE_SERVICE_URL || 'http://localhost:8001';

async function classifySupplierReply(requirementSnapshot, allocationSnapshot, replyText) {
    const textInput = `Konteks RFQ: Material ${requirementSnapshot.materialName}, ` +
        `kuantitas diminta ${allocationSnapshot.qty} ${requirementSnapshot.unit}, ` +
        `target harga Rp ${allocationSnapshot.price}, ` +
        `target pengiriman maksimal ${allocationSnapshot.lead_time_days} hari. ` +
        `Balasan Supplier: ${replyText}`;

    try {
        // Mode demo hanya memalsukan transport WhatsApp; triase tetap memakai Gemma.
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
        console.error("Triage service Gemma gagal atau tidak dapat dihubungi", e.message);
        return {
            classification: "needs_manual_review",
            ai_summary: "Gemma tidak dapat menganalisis balasan supplier. Butuh review manual.",
            ai_extracted: null
        };
    }
}

module.exports = { classifySupplierReply };
