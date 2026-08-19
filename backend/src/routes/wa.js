const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');

router.get('/status', async (req, res) => {
    const status = await whatsappService.getStatus();
    res.json(status);
});

module.exports = router;
