const express = require('express');
const { requireRole } = require('../middleware/auth');
const payments = require('../services/paymentService');

const router = express.Router();

router.post('/xendit/webhook', async (req, res, next) => {
  if (!payments.verifyWebhookToken(req.get('x-callback-token'))) {
    return res.status(401).json({ error: 'Webhook tidak terautentikasi' });
  }
  try { res.json(await payments.handleWebhook(req.body)); }
  catch (error) { next(error); }
});

router.get('/mine', requireRole('supplier'), async (req, res, next) => {
  try { res.json(await payments.listForSupplier(req.authUser.app_metadata.supplier_id)); }
  catch (error) { next(error); }
});

router.get('/procurement/:id', requireRole('buyer'), async (req, res, next) => {
  try { res.json(await payments.listForProcurement(req.params.id)); }
  catch (error) { next(error); }
});

router.post('/:id/request', requireRole('buyer'), async (req, res, next) => {
  try { res.json(await payments.createRequest(req.params.id, req.body?.bank || 'BCA')); }
  catch (error) { next(error); }
});

router.post('/:id/demo/pay', requireRole('buyer'), async (req, res, next) => {
  try { res.json(await payments.demoPay(req.params.id)); }
  catch (error) { next(error); }
});

router.post('/:id/ship', requireRole('supplier'), async (req, res, next) => {
  try { res.json(await payments.ship(req.params.id, req.authUser.app_metadata.supplier_id, req.body)); }
  catch (error) { next(error); }
});

router.post('/:id/demo/ship', requireRole('buyer'), async (req, res, next) => {
  try { res.json(await payments.demoShip(req.params.id)); }
  catch (error) { next(error); }
});

router.post('/:id/receive', requireRole('buyer'), async (req, res, next) => {
  try { res.json(await payments.receive(req.params.id)); }
  catch (error) { next(error); }
});

router.post('/:id/dispute', requireRole('buyer'), async (req, res, next) => {
  try { res.json(await payments.dispute(req.params.id, req.body?.reason)); }
  catch (error) { next(error); }
});

module.exports = router;
