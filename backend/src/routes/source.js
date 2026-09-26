const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');
const geminiService = require('../services/geminiService');
const { haversineDistance, isValidPoint } = require('../services/distance');
const { MAX_RFQ_SUPPLIERS } = require('../services/rfqLimits');

router.post('/', async (req, res) => {
  try {
      let requirement = req.body || {};

      if ((!requirement.rawInput && typeof requirement.materialName !== 'string') ||
          (!requirement.rawInput && !requirement.materialName.trim())) {
          return res.status(400).json({ error: "materialName atau rawInput wajib diisi" });
      }
      
      // Jika request berupa rawInput string (natural language), parse dengan Gemini AI
      if (req.body.rawInput) {
          requirement = await geminiService.parseRequirementIntent(req.body.rawInput);
          // Merge priority dari request jika ada (user memilih lewat tombol)
          if (req.body.priority) {
              requirement.priority = req.body.priority;
          }
      }
      
    const { materialName } = requirement;

      // 1. Ambil kandidat supplier berdasarkan kategori material (fuzzy match)
      // Ini memastikan kita hanya membandingkan supplier yang relevan dengan jenis bahan baku.
      let candidates = await dataStore.getSuppliersByCategory(materialName);

      // Fallback: Jika kandidat kurang dari 2, lakukan pencarian yang lebih luas
      // pada nama supplier atau kategori, memastikan demo selalu menampilkan hasil.
      if (candidates.length < 2) {
          candidates = (await dataStore.getAllSuppliers()).filter(s =>
              s.material_category.toLowerCase().includes(materialName.toLowerCase()) ||
              s.name.toLowerCase().includes(materialName.toLowerCase())
          );
      }

      // Fallback Ekstrem: Jika masih kosong (salah eja dsb), ambil semua supplier (Mencegah layar kosong saat demo)
      if (candidates.length === 0) {
          candidates = await dataStore.getAllSuppliers();
      }

      // Catatan: MOQ dan lead time TIDAK dipakai untuk menyaring kandidat di sini.
      // RFQ dikirim ke maksimal lima supplier pertama dalam urutan pencarian;
      // ranking & alokasi
      // baru dihitung setelah supplier membalas (lihat POST /api/optimize/from-replies),
      // karena hanya supplier sendiri yang benar-benar tahu apa yang sanggup mereka penuhi.

      const totalMatches = candidates.length;
      const deliveryLat = req.body.delivery_lat;
      const deliveryLng = req.body.delivery_lng;
      const hasDeliveryPoint = isValidPoint(deliveryLat, deliveryLng);
      candidates = candidates.slice(0, MAX_RFQ_SUPPLIERS).map(supplier => {
          const safe = dataStore.publicSupplier(supplier);
          if (!hasDeliveryPoint || !supplier.location_verified) return safe;
          const distance = haversineDistance(deliveryLat, deliveryLng, supplier.lat, supplier.lng);
          return distance === null ? safe : { ...safe, distance_km: distance };
      });

      res.json({
        requirement,
        candidates,
        total_matches: totalMatches
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses source" });
  }
});

module.exports = router;
