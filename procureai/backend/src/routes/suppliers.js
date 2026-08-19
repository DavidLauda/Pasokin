const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');

// Route untuk mendapatkan semua data supplier (untuk keperluan debug)
router.get('/', (req, res) => {
  res.json(dataStore.getAllSuppliers());
});

module.exports = router;
