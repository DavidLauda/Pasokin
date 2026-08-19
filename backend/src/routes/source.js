const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');
const geminiService = require('../services/geminiService');

router.post('/', async (req, res) => {
  try {
      let requirement = req.body;
      
      // Jika request berupa rawInput string (natural language), parse dengan Gemini AI
      if (req.body.rawInput) {
          requirement = await geminiService.parseRequirementIntent(req.body.rawInput);
          // Merge priority dari request jika ada (user memilih lewat tombol)
          if (req.body.priority) {
              requirement.priority = req.body.priority;
          }
      }
      
      const { materialName, quantity, targetDeliveryDate } = requirement;
      
      // Hitung sisa hari dari hari ini ke target pengiriman
      const targetDate = new Date(targetDeliveryDate);
      const today = new Date();
      const diffTime = targetDate - today;
      const daysUntilDelivery = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // 1. TAHAP PERTAMA: Ambil kandidat supplier berdasarkan kategori material (fuzzy match)
      // Ini memastikan kita hanya membandingkan supplier yang relevan dengan jenis bahan baku.
      let candidates = dataStore.getSuppliersByCategory(materialName);
      
      // Fallback: Jika kandidat kurang dari 2, lakukan pencarian yang lebih luas
      // pada nama supplier atau kategori, memastikan demo selalu menampilkan hasil.
      if (candidates.length < 2) {
          candidates = dataStore.getAllSuppliers().filter(s => 
              s.material_category.toLowerCase().includes(materialName.toLowerCase()) ||
              s.name.toLowerCase().includes(materialName.toLowerCase())
          );
      }
      
      // Fallback Ekstrem: Jika masih kosong (salah eja dsb), ambil semua supplier (Mencegah layar kosong saat demo)
      if (candidates.length === 0) {
          candidates = dataStore.getAllSuppliers();
      }
      
      // 2. TAHAP KEDUA: Filter supplier yang tidak masuk akal (hard constraints)
      candidates = candidates.filter(supplier => {
          // Aturan A: Lead time (waktu proses) tidak boleh melebihi sisa waktu target pengiriman
          // Alasan: Supplier tidak akan bisa mengirim tepat waktu
          if (daysUntilDelivery > 0 && supplier.lead_time_days > daysUntilDelivery) {
              return false;
          }
          
          // Aturan B: Kuantitas pemesanan harus lebih besar atau sama dengan Minimum Order Qty (MOQ)
          // Alasan: Supplier tidak akan menerima order jika di bawah MOQ mereka
          if (quantity && quantity < supplier.min_order_qty) {
              return false;
          }
          
          return true;
      });
      
      // 3. TAHAP KETIGA: Batasi jumlah rekomendasi awal
      // Kembalikan top 5 kandidat untuk dihitung optimasinya di tahapan berikutnya.
      candidates = candidates.slice(0, 5);
      
      res.json({
        requirement,
        candidates
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses source" });
  }
});

module.exports = router;
