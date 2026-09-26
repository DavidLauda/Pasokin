const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');

router.get('/status', async (req, res) => {
    const status = await whatsappService.getStatus();
    res.json(status);
});

// Fonnte POST ke sini tiap ada balasan WhatsApp masuk — set URL ini
// (https://<domain-publik-anda>/api/wa/webhook) di dashboard Fonnte > Device > Webhook URL.
router.post('/webhook', async (req, res, next) => {
    try {
        await whatsappService.handleIncomingWebhook(req.body);
        res.sendStatus(200);
    } catch (e) {
        console.error("Gagal memproses webhook Fonnte", e);
        next(e);
    }
});

module.exports = router;
