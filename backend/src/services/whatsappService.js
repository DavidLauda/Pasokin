const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const dispatchLog = require('./dispatchLog');
const repliesStore = require('./repliesStore');
const triageService = require('./triageService');
const crypto = require('crypto');

let sock = null;
let connectionState = 'disconnected'; 
let currentQR = null;

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
    if (process.env.DEMO_MODE === 'true') {
        console.log("[MOCK] WhatsApp Service running in DEMO_MODE. No real connection will be made.");
        connectionState = 'connected';
        return;
    }

    const { state, saveCreds } = await useMultiFileAuthState('./.baileys_auth');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: require('pino')({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            connectionState = 'qr_pending';
            currentQR = qr;
            console.log("\n[WhatsApp] Scan QR ini untuk login:");
            QRCode.toString(qr, { type: 'terminal', small: true }, function (err, url) {
                if (!err) console.log(url);
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[WhatsApp] Connection closed, reconnecting:', shouldReconnect);
            connectionState = 'disconnected';
            
            if (shouldReconnect) {
                initWhatsApp();
            } else {
                console.log("[WhatsApp] Logged out. Tolong hapus folder .baileys_auth dan restart.");
            }
        } else if (connection === 'open') {
            console.log('[WhatsApp] Terhubung!');
            connectionState = 'connected';
            currentQR = null;
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;
        
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            const senderJid = msg.key.remoteJid;
            const senderPhone = senderJid.split('@')[0];
            const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
            
            if (!messageText) continue;

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
    });
}

async function sendMessage(phone, message) {
    if (process.env.DEMO_MODE === 'true') {
        console.log(`[MOCK] Mengirim WA ke ${phone}...`);
        await new Promise(r => setTimeout(r, 1500));
        console.log(`[MOCK] Pesan terkirim ke ${phone}`);
        return true;
    }

    if (connectionState !== 'connected' || !sock) {
        throw new Error("WhatsApp belum terhubung.");
    }

    try {
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.substring(1);
        }
        const jid = `${formattedPhone}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text: message });
        return true;
    } catch (err) {
        console.error(`[WhatsApp] Gagal mengirim pesan ke ${phone}:`, err);
        return false;
    }
}

async function getStatus() {
    let qrBase64 = null;
    if (currentQR) {
        try {
            qrBase64 = await QRCode.toDataURL(currentQR);
        } catch (e) {
            console.error("Gagal convert QR ke base64", e);
        }
    }
    return {
        connectionState: process.env.DEMO_MODE === 'true' ? 'connected' : connectionState,
        qr: qrBase64,
        isDemo: process.env.DEMO_MODE === 'true'
    };
}

module.exports = {
    initWhatsApp,
    sendMessage,
    getStatus,
    processReplyClassification
};
