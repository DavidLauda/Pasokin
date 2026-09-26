const express = require('express');
const flow = require('../services/manualConfirmation');

const router = express.Router();

router.get('/', async (req, res) => res.json(await flow.list()));
router.get('/:id', async (req, res) => res.json(await flow.detail(req.params.id)));
router.post('/:id/summary', async (req, res) => res.json(await flow.submit(req.params.id, req.body)));
router.post('/:id/resolve', async (req, res) => res.json(await flow.resolve(req.params.id, req.body?.decision)));

module.exports = router;
