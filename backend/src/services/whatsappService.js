const axios = require('axios');
const dispatchLog = require('./dispatchLog');
const repliesStore = require('./repliesStore');
const triageService = require('./triageService');
const crypto = require('crypto');
const configService = require('./configService');

// Fonnte: WhatsApp gateway pihak ketiga. Device ditautkan lewat dashboard Fonnte
// (fonnte.com), bukan lewat QR di aplikasi ini — jauh lebih kecil risiko akun
// ditandai WhatsApp dibanding self-host socket unofficial (mis. Baileys).
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const FONNTE_API_URL = 'https://api.fonnte.com';

let cachedStatus = null;
let cachedStatusAt = 0;
const STATUS_CACHE_MS = 10000; // hindari nge-hit API Fonnte tiap kali modal polling (3 detik sekali)

async function processReplyClassification(replyEntry, latestDispatch) {
    try {
        const result = await triageService.classifySupplierReply(
            latestDispatch.requirement_snapshot,
            latestDispatch.allocation_snapshot,
            replyEntry.message_received
        );
        repliesStore.updateReply(replyEntry.reply_id, {
            classification: result.classification,
            ai_summary: result.ai_summary,
            ai_extracted: result.ai_extracted
        });
    } catch (e) {
        console.error("Gagal klasifikasi reply", e);
        repliesStore.updateReply(replyEntry.reply_id, {
            classification: "needs_manual_review",
            ai_summary: "Terjadi error saat analisis AI. Butuh review manual.",
            ai_extracted: null
        });
    }
}

async function initWhatsApp() {
    if (configService.isDemoMode()) {
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
    let formatted = phone.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substring(1);
    }
    return formatted;
}

async function sendMessage(phone, message) {
    if (configService.isDemoMode()) {
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
            { headers: { Authorization: FONNTE_TOKEN } }
        );
        return !!res.data?.status;
    } catch (err) {
        console.error(`[Fonnte] Gagal mengirim pesan ke ${phone}:`, err.response?.data || err.message);
        return false;
    }
}

async function getStatus() {
    if (configService.isDemoMode()) {
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

function reinitialize() {
    // Tidak ada socket persisten yang perlu di-manage — cukup paksa re-check
    // status device Fonnte begitu mode demo/live berganti.
    cachedStatus = null;
    initWhatsApp();
}

// Dipanggil dari route webhook saat Fonnte meneruskan balasan WhatsApp yang masuk
// (device di dashboard Fonnte perlu di-set Webhook URL-nya ke POST /api/wa/webhook).
async function handleIncomingWebhook(payload) {
    const senderPhone = (payload?.sender || '').replace(/\D/g, '');
    const messageText = payload?.message || '';
    if (!senderPhone || !messageText) return;

    const logs = dispatchLog.getAllLogs().filter(l => {
        let lp = l.phone.replace(/\D/g, '');
        if (lp.startsWith('0')) lp = '62' + lp.substring(1);
        return lp === senderPhone;
    });

    const latestDispatch = logs.length > 0 ? logs[logs.length - 1] : null;

    const reply_id = crypto.randomUUID();
    const replyEntry = {
        reply_id,
        dispatch_id: latestDispatch ? latestDispatch.dispatch_id : null,
        supplier_id: latestDispatch ? latestDispatch.supplier_id : null,
        supplier_name: latestDispatch ? latestDispatch.name : null,
        phone: senderPhone,
        message_received: messageText,
        received_at: new Date().toISOString(),
        classification: latestDispatch ? "pending" : "unmatched",
        ai_summary: latestDispatch ? "Sedang menganalisis..." : "Pesan tidak dikenal (tidak ada histori RFQ)",
        ai_extracted: null,
        human_override: false,
        resolved: false
    };

    repliesStore.addReply(replyEntry);

    if (latestDispatch) {
        // Jangan ditunggu, biarkan asynchronous
        processReplyClassification(replyEntry, latestDispatch);
    }
}

module.exports = {
    initWhatsApp,
    sendMessage,
    getStatus,
    processReplyClassification,
    reinitialize,
    handleIncomingWebhook
};
