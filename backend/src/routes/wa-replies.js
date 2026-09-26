const express = require('express');
const router = express.Router();
const repliesStore = require('../services/repliesStore');
const dispatchLog = require('../services/dispatchLog');
const whatsappService = require('../services/whatsappService');
const configService = require('../services/configService');
const dataStore = require('../services/dataStore');
const optimizerService = require('../services/optimizerService');
const crypto = require('crypto');
const procurementsStore = require('../services/procurementsStore');

function simulatedSupplierMessage(style, dispatch) {
    const { qty, price, lead_time_days } = dispatch.allocation_snapshot;
    const unit = dispatch.requirement_snapshot.unit || 'unit';
    const quantity = `${Number(qty).toLocaleString('id-ID')} ${unit}`;
    const targetPrice = Number(price);
    const targetDays = Number(lead_time_days);
    const priceText = Number.isFinite(targetPrice) && targetPrice > 0
        ? `Rp ${targetPrice.toLocaleString('id-ID')} per ${unit}` : 'harga yang diminta';
    const deliveryText = Number.isFinite(targetDays) && targetDays > 0
        ? `dalam ${targetDays} hari` : 'sesuai jadwal yang diminta';

    if (style === 'confirmed') {
        return `Baik, kami setuju. Stok ${quantity} tersedia, harga ${priceText}, dan bisa dikirim ${deliveryText}.`;
    }
    if (style === 'negotiate') {
        const offeredPrice = Number.isFinite(targetPrice) && targetPrice > 0
            ? `Rp ${Math.ceil(targetPrice * 1.05).toLocaleString('id-ID')} per ${unit}`
            : 'harga lebih tinggi dari penawaran awal';
        return `Stok ${quantity} tersedia, tetapi kami hanya bisa menawarkan ${offeredPrice}. Apakah harga baru ini disetujui?`;
    }
    return `Maaf, stok ${dispatch.requirement_snapshot.materialName || 'material'} sedang kosong. Kami belum bisa memenuhi permintaan ini.`;
}

router.get('/', async (req, res) => {
    let replies = await repliesStore.getAllReplies();
    if (req.query.status) {
        replies = replies.filter(r => r.classification === req.query.status);
    }
    const procurementId = req.query.procurement_id || req.query.dispatch_id;
    if (procurementId) {
        replies = replies.filter(r => r.dispatch_id === procurementId);
    }
    
    // Attach dispatch snapshots for UI comparison
    const allLogs = await dispatchLog.getAllLogs();
    const enrichedReplies = replies.map(r => {
        const dispatch = allLogs.find(l => l.dispatch_id === r.dispatch_id && l.supplier_id === r.supplier_id);
        if (dispatch) {
            return {
                ...r,
                original_requirement: dispatch.requirement_snapshot,
                original_allocation: dispatch.allocation_snapshot
            };
        }
        return r;
    });
    
    res.json(enrichedReplies);
});

router.post('/:reply_id/override', async (req, res) => {
    const { reply_id } = req.params;
    const { classification, note } = req.body;
    
    if (!['confirmed', 'needs_manual_review'].includes(classification)) {
        return res.status(400).json({ error: 'Klasifikasi tidak valid' });
    }
    const updated = await repliesStore.updateReply(reply_id, {
        classification,
        human_override: true,
        override_note: note
    });
    
    if (!updated) return res.status(404).json({ error: "Reply not found" });
    if (updated.procurement_message_id) {
        await procurementsStore.classifyMessage(updated.procurement_message_id, classification);
    }
    if (updated.dispatch_id) {
        const procurement = await procurementsStore.get(updated.dispatch_id);
        if (procurement && !['awaiting_summary_confirmation', 'completed'].includes(procurement.status)) {
            const openReview = (await repliesStore.getAllReplies()).some(reply =>
                reply.dispatch_id === updated.dispatch_id &&
                reply.classification === 'needs_manual_review' && !reply.resolved);
            await procurementsStore.setStatus(updated.dispatch_id,
                openReview ? 'needs_manual_review' : 'triaging');
        }
    }
    res.json(updated);
});

router.post('/:reply_id/resolve', async (req, res) => {
    const { reply_id } = req.params;
    const reply = await repliesStore.getReply(reply_id);
    
    if (!reply) return res.status(404).json({ error: "Reply not found" });

    // Mark as resolved
    await repliesStore.updateReply(reply_id, { resolved: true });
    
    // Find original dispatch to check for shortfall
    const allLogs = await dispatchLog.getAllLogs();
    const dispatch = allLogs.find(l => l.dispatch_id === reply.dispatch_id && l.supplier_id === reply.supplier_id);
    
    if (dispatch) {
        // Did the supplier give us less than we asked for?
        const requestedQty = dispatch.allocation_snapshot.qty;
        const agreedQty = Math.max(0, reply.ai_extracted?.qty || 0); // If null, assume 0
        const deficit = requestedQty - agreedQty;

        if (deficit > 0) {
            // Find contacted suppliers for this dispatch so we don't pick them again
            const contactedIds = allLogs
                .filter(l => l.dispatch_id === dispatch.dispatch_id)
                .map(l => l.supplier_id);
            
            let candidates = await dataStore.getSuppliersByCategory(dispatch.requirement_snapshot.materialName);
            if (candidates.length < 2) {
                 candidates = (await dataStore.getAllSuppliers()).filter(s =>
                       s.material_category.toLowerCase().includes(dispatch.requirement_snapshot.materialName.toLowerCase()) ||
                       s.name.toLowerCase().includes(dispatch.requirement_snapshot.materialName.toLowerCase())
                 );
            }
            
            // Exclude already contacted suppliers
            candidates = candidates.filter(c => !contactedIds.includes(c.id));
            
            // Generate a new requirement for the deficit
            const newReq = { 
                ...dispatch.requirement_snapshot, 
                quantity: deficit 
            };
            
            const optimization = optimizerService.optimizeAllocation(newReq, candidates);
            
            return res.json({ 
                updatedReply: await repliesStore.getReply(reply_id),
                shortfall_recommendations: {
                    requirement: newReq,
                    candidates,
                    optimization
                }
            });
        }
    }
    
    res.json({ updatedReply: await repliesStore.getReply(reply_id) });
});

// SIMULATE ENDPOINT (DEMO_MODE ONLY)
router.post('/simulate', async (req, res) => {
    if (!await configService.isDemoMode()) {
        return res.status(403).json({ error: "Hanya tersedia saat DEMO_MODE=true" });
    }

    const { phone, style, procurement_id, supplier_id } = req.body;
    if (!phone || !style || !procurement_id) return res.status(400).json({ error: "phone, style and procurement_id required" });

    console.log("Simulate called with phone:", phone, "style:", style);

    // Restrict the simulation to the selected procurement, even if the same
    // phone has been contacted for another open order.
    const logs = (await dispatchLog.getAllLogs()).filter(l => {
        if (l.dispatch_id !== procurement_id || (supplier_id && l.supplier_id !== supplier_id)) return false;
        let lp = l.phone.replace(/\D/g, '');
        if (lp.startsWith('0')) lp = '62' + lp.substring(1);
        
        let reqPhone = phone.replace(/\D/g, '');
        if (reqPhone.startsWith('0')) reqPhone = '62' + reqPhone.substring(1);
        
        return lp === reqPhone;
    });

    if (logs.length > 1) return res.status(409).json({ error: 'Pilih supplier_id untuk nomor yang dipakai bersama' });
    const latestDispatch = logs[0] || null;
    if (!latestDispatch) return res.status(404).json({ error: 'Supplier tidak ada pada procurement ini' });
    const procurement = await procurementsStore.get(procurement_id);
    if (!procurement) return res.status(404).json({ error: 'Procurement tidak ditemukan' });

    const simulatedMessage = `[${procurement.reference_code}] ${simulatedSupplierMessage(style, latestDispatch)}`;
    console.log("Simulated message:", simulatedMessage);

    const supplierUuid = await procurementsStore.supplierUuid(latestDispatch.supplier_id);
    const message = await procurementsStore.addMessage({ procurementId: procurement_id,
        supplierId: supplierUuid, direction: 'inbound', rawText: simulatedMessage });

    const reply_id = crypto.randomUUID();
    const replyEntry = {
        reply_id,
        procurement_message_id: message.id,
        dispatch_id: latestDispatch ? latestDispatch.dispatch_id : null,
        supplier_id: latestDispatch ? latestDispatch.supplier_id : null,
        supplier_name: latestDispatch ? latestDispatch.name : null,
        phone,
        message_received: simulatedMessage,
        received_at: new Date().toISOString(),
        classification: latestDispatch ? "pending" : "unmatched",
        ai_summary: latestDispatch ? "Sedang menganalisis..." : "Pesan tidak dikenal",
        ai_extracted: null,
        human_override: false,
        resolved: false
    };

    await repliesStore.addReply(replyEntry);
    console.log("Reply added to store");

    if (latestDispatch) {
        console.log("Latest dispatch found, calling processReplyClassification");
        await whatsappService.processReplyClassification(replyEntry, latestDispatch, message.id);
        console.log("Classification finished");
    }

    console.log("Returning JSON");
    res.json(await repliesStore.getReply(reply_id));
});

// SIMULATE ALL ENDPOINT (DEMO_MODE ONLY)
router.post('/simulate-all', async (req, res) => {
    if (!await configService.isDemoMode()) {
        return res.status(403).json({ error: "Hanya tersedia saat DEMO_MODE=true" });
    }

    const procurement_id = req.body.procurement_id || req.body.dispatch_id;
    if (!procurement_id) return res.status(400).json({ error: "procurement_id required" });

    // Cari semua supplier di dispatch ini yang belum punya reply
    const allLogs = (await dispatchLog.getAllLogs()).filter(l => l.dispatch_id === procurement_id);
    if (allLogs.length === 0) return res.status(404).json({ error: "Dispatch not found" });
    const procurement = await procurementsStore.get(procurement_id);
    if (!procurement) return res.status(404).json({ error: 'Procurement tidak ditemukan' });

    const allReplies = await repliesStore.getAllReplies();
    const waitingLogs = allLogs.filter(l => !allReplies.some(r => r.supplier_id === l.supplier_id && r.dispatch_id === l.dispatch_id));

    if (waitingLogs.length === 0) {
        return res.json({ message: "Tidak ada supplier yang menunggu balasan." });
    }

    const newReplies = [];
    const styles = ["confirmed", "negotiate"];

    for (const [index, log] of waitingLogs.entries()) {
        // Variasikan secara selang-seling (atau bisa random)
        const style = styles[index % 2];
        
        const simulatedMessage = `[${procurement.reference_code}] ${simulatedSupplierMessage(style, log)}`;
        const supplierUuid = await procurementsStore.supplierUuid(log.supplier_id);
        const message = await procurementsStore.addMessage({ procurementId: procurement_id,
            supplierId: supplierUuid, direction: 'inbound', rawText: simulatedMessage });
        const reply_id = crypto.randomUUID();
        const replyEntry = {
            reply_id,
            procurement_message_id: message.id,
            dispatch_id: log.dispatch_id,
            supplier_id: log.supplier_id,
            supplier_name: log.name,
            phone: log.phone,
            message_received: simulatedMessage,
            received_at: new Date().toISOString(),
            classification: "pending",
            ai_summary: "Sedang menganalisis...",
            ai_extracted: null,
            human_override: false,
            resolved: false
        };

        await repliesStore.addReply(replyEntry);
        newReplies.push({ replyEntry, log, message });
    }

    // Gunakan pipeline Gemma yang sama dengan /simulate dan balasan WhatsApp asli.
    await Promise.allSettled(
        newReplies.map(item => whatsappService.processReplyClassification(item.replyEntry, item.log, item.message.id))
    );

    res.json({ message: "Simulasi batched selesai.", count: newReplies.length });
});

module.exports = router;
