const express = require('express');
const router = express.Router();
const configService = require('../services/configService');
const whatsappService = require('../services/whatsappService');

router.get('/', async (req, res, next) => {
  try { res.json({ demoMode: await configService.isDemoMode() }); }
  catch (error) { next(error); }
});

router.post('/demo-mode', async (req, res, next) => {
  try {
    const { demoMode } = req.body;
    if (typeof demoMode !== 'boolean') {
      return res.status(400).json({ error: 'demoMode must be a boolean' });
    }
    await configService.setDemoMode(demoMode);
    await whatsappService.reinitialize();
    res.json({ demoMode });
  } catch (error) { next(error); }
});

module.exports = router;
