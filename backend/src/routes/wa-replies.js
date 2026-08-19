const express = require('express');
const router = express.Router();
const repliesStore = require('../services/repliesStore');
const dispatchLog = require('../services/dispatchLog');
const whatsappService = require('../services/whatsappService');
const configService = require('../services/configService');
const dataStore = require('../services/dataStore');
const optimizerService = require('../services/optimizerService');
const crypto = require('crypto');

router.get('/', (req, res) => {
    let replies = repliesStore.getAllReplies();
    if (req.query.status) {
        replies = replies.filter(r => r.classification === req.query.status);
    }
    if (req.query.dispatch_id) {
        replies = replies.filter(r => r.dispatch_id === req.query.dispatch_id);
    }
    
    // Attach dispatch snapshots for UI comparison
    const allLogs = dispatchLog.getAllLogs();
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

router.post('/:reply_id/override', (req, res) => {
    const { reply_id } = req.params;
    const { classification, note } = req.body;
    
    const updated = repliesStore.updateReply(reply_id, {
        classification,
        human_override: true,
        override_note: note
    });
    
    if (!updated) return res.status(404).json({ error: "Reply not found" });
    res.json(updated);
});

router.post('/:reply_id/resolve', (req, res) => {
    const { reply_id } = req.params;
    const reply = repliesStore.getReply(reply_id);
    
    if (!reply) return res.status(404).json({ error: "Reply not found" });

    // Mark as resolved
    repliesStore.updateReply(reply_id, { resolved: true });
    
    // Find original dispatch to check for shortfall
    const allLogs = dispatchLog.getAllLogs();
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
            
            let candidates = dataStore.getSuppliersByCategory(dispatch.requirement_snapshot.materialName);
            if (candidates.length < 2) {
                 candidates = dataStore.getAllSuppliers().filter(s => 
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
                updatedReply: repliesStore.getReply(reply_id), 
                shortfall_recommendations: {
                    requirement: newReq,
                    candidates,
                    optimization
                }
            });
        }
    }
    
    res.json({ updatedReply: repliesStore.getReply(reply_id) });
});

// SIMULATE ENDPOINT (DEMO_MODE ONLY)
router.post('/simulate', async (req, res) => {
    if (!configService.isDemoMode()) {
        return res.status(403).json({ error: "Hanya tersedia saat DEMO_MODE=true" });
    }

    const { phone, style } = req.body;
    if (!phone || !style) return res.status(400).json({ error: "phone and style required" });

    console.log("Simulate called with phone:", phone, "style:", style);

    // Cari log dispatch terbaru untuk nomor ini
    const logs = dispatchLog.getAllLogs().filter(l => {
        let lp = l.phone.replace(/\D/g, '');
        if (lp.startsWith('0')) lp = '62' + lp.substring(1);
        
        let reqPhone = phone.replace(/\D/g, '');
        if (reqPhone.startsWith('0')) reqPhone = '62' + reqPhone.substring(1);
        
        return lp === reqPhone;
    });

    const latestDispatch = logs.length > 0 ? logs[logs.length - 1] : null;

    let simulatedMessage = "";
    if (style === "confirmed") {
        simulatedMessage = "Baik pak, stok ada dan harga Rp 62.000 cocok. Bisa kita kirim besok.";
    } else if (style === "negotiate") {
        simulatedMessage = "Waduh pak, kalau Rp 62.000 ga dapet sekarang. Harganya naik jadi Rp 65.000. Gimana?";
    } else {
        simulatedMessage = "Maaf pak, barang kosong.";
    }
    
    console.log("Simulated message:", simulatedMessage);

    const reply_id = crypto.randomUUID();
    const replyEntry = {
        reply_id,
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

    repliesStore.addReply(replyEntry);
    console.log("Reply added to store");

    if (latestDispatch) {
        console.log("Latest dispatch found, calling processReplyClassification");
        await whatsappService.processReplyClassification(replyEntry, latestDispatch);
        console.log("Classification finished");
    }

    console.log("Returning JSON");
    res.json(repliesStore.getReply(reply_id));
});

module.exports = router;
