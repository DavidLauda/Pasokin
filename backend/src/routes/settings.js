const express = require('express');
const router = express.Router();
const configService = require('../services/configService');

router.get('/', (req, res) => {
    res.json({ demoMode: configService.isDemoMode() });
});

router.post('/demo-mode', (req, res) => {
    const { demoMode } = req.body;
    if (typeof demoMode !== 'boolean') {
        return res.status(400).json({ error: "demoMode must be a boolean" });
    }
    
    configService.setDemoMode(demoMode);
    res.json({ demoMode: configService.isDemoMode() });
});

module.exports = router;
