const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const dataStore = require('../services/dataStore');
const { requireRole } = require('../middleware/auth');

router.get('/me', requireRole('supplier'), async (req, res, next) => {
  try {
    const id = req.authUser.app_metadata.supplier_id;
    if (!id) return res.status(409).json({ error: 'Akun supplier belum memiliki ID profil' });
    const profile = await dataStore.getSupplierDetail(id);
    res.json(profile);
  } catch (error) { next(error); }
});

router.post('/me', requireRole('supplier'), async (req, res, next) => {
  try {
    const id = req.authUser.app_metadata.supplier_id;
    if (!id) return res.status(409).json({ error: 'Akun supplier belum memiliki ID profil' });
    if (await dataStore.getSupplierDetail(id)) return res.status(409).json({ error: 'Profil supplier sudah terdaftar' });
    res.status(201).json(await dataStore.addSupplier(req.body, id));
  } catch (error) { next(error); }
});

router.put('/me', requireRole('supplier'), async (req, res, next) => {
  try {
    const id = req.authUser.app_metadata.supplier_id;
    if (!id) return res.status(409).json({ error: 'Akun supplier belum memiliki ID profil' });
    const profile = await dataStore.updateSupplier(id, req.body);
    if (!profile) return res.status(404).json({ error: 'Profil supplier belum terdaftar' });
    res.json(profile);
  } catch (error) { next(error); }
});

router.get('/', requireRole('buyer'), async (req, res, next) => {
  try { res.json((await dataStore.getAllSuppliers()).map(dataStore.publicSupplier)); }
  catch (error) { next(error); }
});

async function createSupplier(req, res, next) {
  try {
    res.status(201).json(dataStore.publicSupplier(await dataStore.addSupplier(req.body)));
  } catch (error) { next(error); }
}

router.post('/', requireRole('buyer'), createSupplier);
router.post('/register', requireRole('buyer'), createSupplier);

router.post('/geocode', requireRole('buyer', 'supplier'), async (req, res, next) => {
  try {
    const address = String(req.body.address || '').trim();
    if (address.length < 10 || address.length > 500) return res.status(400).json({ error: 'Alamat tidak valid' });
    if (!process.env.GOOGLE_GEOCODING_API_KEY) {
      return res.status(503).json({ error: 'Geocoding belum dikonfigurasi; pilih pin pada peta' });
    }
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', process.env.GOOGLE_GEOCODING_API_KEY);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Layanan geocoding gagal');
    const result = await response.json();
    const location = result.results?.[0]?.geometry?.location;
    if (!location) return res.status(404).json({ error: 'Alamat tidak ditemukan; pilih pin pada peta' });
    res.json({ lat: location.lat, lng: location.lng });
  } catch (error) { next(error); }
});

router.get('/admin/:id', requireRole('buyer'), async (req, res, next) => {
  try {
    const expected = process.env.PASOKIN_ADMIN_TOKEN;
    const received = req.get('x-pasokin-admin-token') || '';
    if (!expected) return res.status(503).json({ error: 'Akses data lengkap belum dikonfigurasi' });
    const actual = Buffer.from(received);
    const secret = Buffer.from(expected);
    if (actual.length !== secret.length || !crypto.timingSafeEqual(actual, secret)) {
      return res.status(401).json({ error: 'Kunci admin tidak valid' });
    }
    const supplier = await dataStore.getSupplierDetail(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    res.json(supplier);
  } catch (error) { next(error); }
});

router.get('/:id', requireRole('buyer'), async (req, res, next) => {
  try {
    const supplier = await dataStore.getSupplierDetail(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    const { transactions, ...row } = supplier;
    res.json({ ...dataStore.publicSupplier(row), transactions });
  } catch (error) { next(error); }
});

router.put('/:id', requireRole('buyer'), async (req, res, next) => {
  try {
    const updated = await dataStore.updateSupplier(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    res.json(dataStore.publicSupplier(updated));
  } catch (error) { next(error); }
});

router.delete('/:id', requireRole('buyer'), async (req, res, next) => {
  try {
    const deleted = await dataStore.deleteSupplier(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    res.json({ message: 'Supplier berhasil dihapus' });
  } catch (error) { next(error); }
});

module.exports = router;
