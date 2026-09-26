const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');

router.get('/', async (req, res, next) => {
  try { res.json(await dataStore.getAllSuppliers()); }
  catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!req.body.name || !req.body.phone || !req.body.material_category) {
      return res.status(400).json({ error: 'Nama, telepon, dan kategori wajib diisi' });
    }
    res.status(201).json(await dataStore.addSupplier(req.body));
  } catch (error) { next(error); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const updated = await dataStore.updateSupplier(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    res.json(updated);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await dataStore.deleteSupplier(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    res.json({ message: 'Supplier berhasil dihapus' });
  } catch (error) { next(error); }
});

module.exports = router;
