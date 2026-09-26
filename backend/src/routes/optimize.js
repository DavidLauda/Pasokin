const express = require('express');
const router = express.Router();
const optimizerService = require('../services/optimizerService');
const procurementsStore = require('../services/procurementsStore');

function describeAllocation(requirement, savingsPercent) {
  const { cost = 40, speed = 40, risk = 20 } = requirement.priority || {};
  return `Alokasi beberapa pemasok dipilih berdasarkan prioritas pengadaan Anda (Biaya: ${cost}%, Kecepatan: ${speed}%, Risiko: ${risk}%). Estimasi penghematan adalah ${savingsPercent}%.`;
}

router.post('/', async (req, res) => {
  try {
      const { requirement, candidates, dispatch_id } = req.body;
      
      if (!requirement || !candidates || candidates.length === 0) {
          return res.status(400).json({ error: "Missing requirement or candidates" });
      }

      // 1. Jalankan optimasi algoritma greedy multi-supplier
      const optimization = optimizerService.optimizeAllocation(requirement, candidates);
      
      if (!optimization || optimization.recommended_allocations.length === 0) {
          return res.status(400).json({ error: "Tidak dapat menemukan alokasi yang valid dengan kriteria yang diberikan." });
      }
      if (dispatch_id) {
          await procurementsStore.saveAllocations(dispatch_id, optimization.recommended_allocations);
          await procurementsStore.setStatus(dispatch_id, 'awaiting_approval');
      }

      // Ringkasan deterministik; Gemini hanya dipakai untuk parsing RFQ buyer.
      const ai_reasoning = describeAllocation(requirement, optimization.savings_estimate_percent);

      // Kembalikan sesuai struktur yang dibutuhkan frontend
      res.json({
        total_cost: optimization.total_cost,
        recommended_allocations: optimization.recommended_allocations,
        savings_estimate_percent: optimization.savings_estimate_percent,
        ai_reasoning: ai_reasoning
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Gagal memproses optimasi" });
  }
});

module.exports = router;
