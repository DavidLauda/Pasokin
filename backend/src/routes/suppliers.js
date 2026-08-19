const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');

// Route untuk mendapatkan semua data supplier
router.get('/', (req, res) => {
  res.json(dataStore.getAllSuppliers());
});

// Route untuk menambah supplier baru
router.post('/', (req, res) => {
  try {
    const newSupplier = dataStore.addSupplier(req.body);
    res.status(201).json(newSupplier);
  } catch (error) {
    res.status(500).json({ error: 'Gagal menambah supplier' });
  }
});

// Route untuk mengupdate supplier
router.put('/:id', (req, res) => {
  try {
    const updated = dataStore.updateSupplier(req.params.id, req.body);
    if (updated) {
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Supplier tidak ditemukan' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengupdate supplier' });
  }
});

// Route untuk menghapus supplier
router.delete('/:id', (req, res) => {
  try {
    const success = dataStore.deleteSupplier(req.params.id);
    if (success) {
      res.json({ message: 'Supplier berhasil dihapus' });
    } else {
      res.status(404).json({ error: 'Supplier tidak ditemukan' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus supplier' });
  }
});

module.exports = router;
