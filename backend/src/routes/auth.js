const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { requireRole } = require('../middleware/auth');

router.post('/register', async (req, res, next) => {
  try { res.status(201).json(await authService.register(req.body || {})); }
  catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try { res.json(await authService.signIn(req.body?.email, req.body?.password, req.body?.role)); }
  catch (error) { next(error); }
});

router.post('/refresh', async (req, res, next) => {
  try { res.json(await authService.refresh(req.body?.refresh_token)); }
  catch (error) { next(error); }
});

router.get('/me', requireRole('buyer', 'supplier'), (req, res) => {
  res.json({ user: authService.publicUser(req.authUser) });
});

router.post('/logout', requireRole('buyer', 'supplier'), async (req, res, next) => {
  try {
    await authService.signOut(req.accessToken);
    res.sendStatus(204);
  } catch (error) { next(error); }
});

module.exports = router;
