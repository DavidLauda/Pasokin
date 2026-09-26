const axios = require('axios');
const dispatchLog = require('./dispatchLog');
const repliesStore = require('./repliesStore');
const triageService = require('./triageService');
const crypto = require('crypto');
const configService = require('./configService');
const procurementsStore = require('./procurementsStore');
const { correlateReply } = require('./replyCorrelation');

// Fonnte: WhatsApp gateway pihak ketiga. Device ditautkan lewat dashboard Fonnte
// (fonnte.com), bukan lewat QR di aplikasi ini — jauh lebih kecil risiko akun
// ditandai WhatsApp dibanding self-host socket unofficial (mis. Baileys).
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const FONNTE_API_URL = 'https://api.fonnte.com';

let cachedStatus = null;
let cachedStatusAt = 0;
const STATUS_CACHE_MS = 10000; // hindari nge-hit API Fonnte tiap kali modal polling (3 detik sekali)

async function processReplyClassification(replyEntry, latestDispatch, messageId = null) {
    try {
        const result = await triageService.classifySupplierReply(
            latestDispatch.requirement_snapshot,
            latestDispatch.allocation_snapshot,
            replyEntry.message_received,
            latestDispatch.dispatched_at
        );
        await repliesStore.updateReply(replyEntry.reply_id, {
            classification: result.classification,
            ai_summary: result.ai_summary,
            ai_extracted: result.ai_extracted
        });
        if (messageId) await procurementsStore.classifyMessage(messageId, result.classification);
        if (replyEntry.dispatch_id) {
            const current = await procurementsStore.get(replyEntry.dispatch_id);
            if (current && !['awaiting_summary_confirmation', 'completed'].includes(current.status)) {
                if (result.classification === 'needs_manual_review') {
                    await procurementsStore.setStatus(replyEntry.dispatch_id, 'needs_manual_review');
                } else if (current.status !== 'needs_manual_review') {
                    await procurementsStore.setStatus(replyEntry.dispatch_id, 'triaging');
                }
            }
        }
    } catch (e) {
        console.error("Gagal klasifikasi reply", e);
        await repliesStore.updateReply(replyEntry.reply_id, {
            classification: "needs_manual_review",
            ai_summary: "Terjadi error saat analisis AI. Butuh review manual.",
            ai_extracted: null
        });
        if (messageId) await procurementsStore.classifyMessage(messageId, 'needs_manual_review');
        if (replyEntry.dispatch_id) {
            const current = await procurementsStore.get(replyEntry.dispatch_id);
            if (current && !['awaiting_summary_confirmation', 'completed'].includes(current.status))
                await procurementsStore.setStatus(replyEntry.dispatch_id, 'needs_manual_review');
        }
    }
}

async function initWhatsApp() {
    if (await configService.isDemoMode()) {
        console.log("[MOCK] WhatsApp Service running in DEMO_MODE. No real connection will be made.");
        return;
    }
    if (!FONNTE_TOKEN) {
        console.warn("[Fonnte] FONNTE_TOKEN belum diisi di backend/.env — WhatsApp Live tidak akan berfungsi.");
        return;
    }
    console.log("[Fonnte] Live mode aktif. Pastikan device sudah ditautkan lewat dashboard Fonnte, dan webhook URL (POST /api/wa/webhook) sudah diset di sana untuk menerima balasan masuk.");
}

function normalizePhone(phone) {
    let formatted = String(phone || '').replace(/\D/g, '');
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substring(1);
    }
    return formatted;
}

async function sendMessage(phone, message) {
    if (await configService.isDemoMode()) {
        console.log(`[MOCK] Mengirim WA ke ${phone}...`);
        await new Promise(r => setTimeout(r, 1500));
        console.log(`[MOCK] Pesan terkirim ke ${phone}`);
        return true;
    }

    if (!FONNTE_TOKEN) {
        throw new Error("FONNTE_TOKEN belum diisi di backend/.env");
    }

    try {
        const res = await axios.post(
            `${FONNTE_API_URL}/send`,
            new URLSearchParams({ target: normalizePhone(phone), message }),
            { headers: { Authorization: FONNTE_TOKEN }, timeout: 60000 }
        );
        return !!res.data?.status;
    } catch (err) {
        console.error(`[Fonnte] Gagal mengirim pesan ke ${phone}:`, err.response?.data || err.message);
        return false;
    }
}

async function getStatus() {
    if (await configService.isDemoMode()) {
        return { connectionState: 'connected', qr: null, isDemo: true };
    }

    if (!FONNTE_TOKEN) {
        return { connectionState: 'disconnected', qr: null, isDemo: false, error: "FONNTE_TOKEN belum diisi di backend/.env" };
    }

    const now = Date.now();
    if (cachedStatus && (now - cachedStatusAt) < STATUS_CACHE_MS) {
        return cachedStatus;
    }

    try {
        const res = await axios.post(`${FONNTE_API_URL}/device`, {}, { headers: { Authorization: FONNTE_TOKEN } });
        const connected = res.data?.device_status === 'connect';
        cachedStatus = { connectionState: connected ? 'connected' : 'disconnected', qr: null, isDemo: false };
    } catch (err) {
        console.error("[Fonnte] Gagal cek status device:", err.response?.data || err.message);
        cachedStatus = { connectionState: 'disconnected', qr: null, isDemo: false, error: "Gagal menghubungi Fonnte" };
    }
    cachedStatusAt = now;
    return cachedStatus;
}

async function reinitialize() {
    // Tidak ada socket persisten yang perlu di-manage — cukup paksa re-check
    // status device Fonnte begitu mode demo/live berganti.
    cachedStatus = null;
    await initWhatsApp();
}

// Dipanggil dari route webhook saat Fonnte meneruskan balasan WhatsApp yang masuk
// (device di dashboard Fonnte perlu di-set Webhook URL-nya ke POST /api/wa/webhook).
async function handleIncomingWebhook(payload) {
    const senderPhone = normalizePhone(payload?.sender);
    const messageText = String(payload?.message || '').trim();
    if (!senderPhone || !messageText) return;

    // Prefer the RFQ code; a reply without it can match only one active
    // supplier/procurement pair for this phone number.
    const { procurement, dispatch: latestDispatch } = await correlateReply(messageText, senderPhone, {
        findProcurement: procurementsStore.getByReference,
        findProcurementById: procurementsStore.get,
        listDispatches: dispatchLog.getAllLogs, normalizePhone
    });
    const summaryReply = latestDispatch && procurement.status === 'awaiting_summary_confirmation';
    let messageId = null;
    if (latestDispatch) {
        const supplierUuid = await procurementsStore.supplierUuid(latestDispatch.supplier_id);
        const message = await procurementsStore.addMessage({ procurementId: procurement.id,
            supplierId: supplierUuid,
            messageType: summaryReply ? 'summary_confirmation' : 'negotiation',
            direction: 'inbound', rawText: messageText });
        messageId = message.id;
    }

    // Summary confirmation is deliberately left for a buyer's manual decision.
    if (summaryReply) {
        await procurementsStore.setStatus(procurement.id, 'awaiting_summary_confirmation');
        return { procurement_id: procurement.id, message_id: messageId,
            message_type: 'summary_confirmation' };
    }

    const reply_id = crypto.randomUUID();
    const replyEntry = {
        reply_id,
        procurement_message_id: messageId,
        dispatch_id: latestDispatch ? latestDispatch.dispatch_id : null,
        supplier_id: latestDispatch ? latestDispatch.supplier_id : null,
        supplier_name: latestDispatch ? latestDispatch.name : null,
        phone: senderPhone,
        message_received: messageText,
        received_at: new Date().toISOString(),
        classification: latestDispatch ? "pending" : "unmatched",
        ai_summary: latestDispatch ? "Sedang menganalisis..." : "Pesan tidak cocok dengan kode RFQ dan supplier",
        ai_extracted: null,
        human_override: false,
        resolved: false
    };

    await repliesStore.addReply(replyEntry);

    if (latestDispatch) {
        if (!['needs_manual_review', 'awaiting_summary_confirmation', 'completed'].includes(procurement.status)) {
            await procurementsStore.setStatus(procurement.id, 'triaging');
        }
        // Vercel dapat menghentikan invocation setelah respons webhook dikirim.
        // Selesaikan triase sebelum memberi HTTP 200 ke Fonnte.
        await processReplyClassification(replyEntry, latestDispatch, messageId);
    }
    return { procurement_id: procurement?.id || null, message_id: messageId,
        message_type: latestDispatch ? 'negotiation' : 'unmatched' };
}

module.exports = {
    initWhatsApp,
    sendMessage,
    getStatus,
    processReplyClassification,
    reinitialize,
    handleIncomingWebhook
};
